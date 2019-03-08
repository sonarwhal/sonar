import * as url from 'url';

import { Engine } from 'hint';
import { getContentTypeData, getType } from 'hint/dist/src/lib/utils/content-type';
import {
    ConnectorOptionsConfig,
    HttpHeaders,
    IConnector,
    FetchEnd,
    NetworkData,
    HTMLDocument,
    HTMLElement
} from 'hint/dist/src/lib/types';
import getElementByUrl from 'hint/dist/src/lib/utils/dom/get-element-by-url';

import { Events } from '../shared/types';
import { eval } from '../shared/globals';
import { browser, document, location, window } from '../shared/globals';
import createHTMLDocument from 'hint/dist/src/lib/utils/dom/create-html-document';
import traverse from 'hint/dist/src/lib/utils/dom/traverse';

export default class WebExtensionConnector implements IConnector {
    private _document = createHTMLDocument(document.documentElement.outerHTML);
    private _engine: Engine;
    private _onComplete: (resource: string) => void = () => { };
    private _options: ConnectorOptionsConfig;

    public constructor(engine: Engine, options?: ConnectorOptionsConfig) {
        this._engine = engine;
        this._options = options || {};

        if (!this._options.waitFor) {
            this._options.waitFor = 1000;
        }

        browser.runtime.onMessage.addListener(async (events: Events) => {
            if (events.fetchEnd) {
                await this.notifyFetch(events.fetchEnd);
            }
            if (events.fetchStart) {
                await this._engine.emitAsync('fetch::start', events.fetchStart);
            }
            // TODO: Trigger 'fetch::start::target'.
        });

        const onLoad = async () => {
            const resource = location.href;

            await this._engine.emitAsync('can-evaluate::script', { resource });

            setTimeout(async () => {

                if (document.documentElement) {
                    this._document = createHTMLDocument(document.documentElement.outerHTML);

                    await traverse(this._document, this._engine, resource);
                }

                this._onComplete(resource);
            }, this._options.waitFor);
        };

        if (document.readyState === 'complete') {
            setTimeout(onLoad, 0);
        } else {
            window.addEventListener('load', onLoad);
        }
    }

    private sendMessage(message: Events) {
        browser.runtime.sendMessage(message);
    }

    private setFetchElement(event: FetchEnd) {
        const url = event.request.url;

        event.element = getElementByUrl(this._document, url);
    }

    private setFetchType(event: FetchEnd): string {
        const { charset, mediaType } = getContentTypeData(null, event.response.url, event.response.headers, null as any);

        event.response.charset = charset || '';
        event.response.mediaType = mediaType || '';

        return getType(mediaType || '');
    }

    private async notifyFetch(event: FetchEnd) {
        this.setFetchElement(event);
        const type = this.setFetchType(event);

        if (event.response.url === location.href) {
            this._document = createHTMLDocument(event.response.body.content);
        }

        await this._engine.emitAsync(`fetch::end::${type}` as 'fetch::end::*', event);
    }

    private mapResponseHeaders(headers: Headers): HttpHeaders {
        const responseHeaders: HttpHeaders = {};

        headers.forEach((val, key) => {
            responseHeaders[key] = val;
        });

        return responseHeaders;
    }

    /* istanbul ignore next */
    public async fetchContent(target: string, headers?: any): Promise<NetworkData> {
        return await fetch(target, { headers }).then(async (response) => {
            const responseHeaders = this.mapResponseHeaders(response.headers);
            const { charset, mediaType } = getContentTypeData(null, target, responseHeaders, null as any);

            return {
                request: { headers: headers as any, url: target },
                response: {
                    body: {
                        content: await response.text(),
                        rawContent: null as any, // TODO: Set once this supports `Blob`.
                        rawResponse: null as any
                    },
                    charset: charset || '',
                    headers: responseHeaders,
                    hops: [],
                    mediaType: mediaType || '',
                    statusCode: response.status,
                    url: target
                }
            };
        });
    }

    public async collect(target: url.URL) {
        const resource = target.href;

        await this._engine.emitAsync('scan::start', { resource });

        this.sendMessage({ ready: true });

        return new Promise((resolve) => {
            this._onComplete = async (resource: string) => {
                await this._engine.emitAsync('scan::end', { resource });
                resolve();
                this.sendMessage({ done: true });
            };
        });
    }

    public evaluate(source: string): Promise<any> {
        // `eval` will run the code inside the browser.
        return Promise.resolve(eval(source)); // eslint-disable-line no-eval
    }

    public querySelectorAll(selector: string): HTMLElement[] {
        return this._document.querySelectorAll(selector);
    }

    /* istanbul ignore next */
    public close() {
        return Promise.resolve();
    }

    public get dom(): HTMLDocument {
        return this._document;
    }

    /* istanbul ignore next */
    public get html(): string {
        return this._document.pageHTML();
    }
}
