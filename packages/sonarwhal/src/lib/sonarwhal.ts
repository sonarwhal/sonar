/**
 * @fileoverview Main sonarwhal object, gets the configuration and loads
 * the connectors, rules and analyzes.
 */

/*
 * ------------------------------------------------------------------------------
 * Requirements
 * ------------------------------------------------------------------------------
 */

import * as url from 'url';

import * as browserslist from 'browserslist';
import chalk from 'chalk';
import { EventEmitter2 as EventEmitter } from 'eventemitter2';
import * as _ from 'lodash';

import { debug as d } from './utils/debug';
import { getSeverity } from './config/config-rules';
import { IAsyncHTMLElement, IConnector, INetworkData, UserConfig, IEvent, IProblem, IProblemLocation, IRule, RuleConfig, Severity, IConnectorConstructor, IRuleConstructor, IParser, SonarwhalResources, IFormatter } from './types';
import * as logger from './utils/logging';
import { RuleContext } from './rule-context';
import { RuleScope } from './enums/rulescope';
import { SonarwhalConfig } from './config';

const debug: debug.IDebugger = d(__filename);

/*
 * ------------------------------------------------------------------------------
 * Public interface
 * ------------------------------------------------------------------------------
 */

export class Sonarwhal extends EventEmitter {
    // TODO: review which ones need to be private or not
    private parsers: Array<IParser>
    private rules: Map<string, IRule>
    private connector: IConnector
    private connectorConfig: object
    private messages: Array<IProblem>
    private browserslist: Array<string> = [];
    private ignoredUrls: Map<string, Array<RegExp>>;
    private _formatters: Array<IFormatter>
    private _timeout: number = 60000;
    private _config: UserConfig;

    /** The DOM of the loaded page. */
    public get pageDOM(): object {
        return this.connector.dom;
    }

    /** The HTML of the loaded page. */
    public get pageContent(): Promise<string> {
        return this.connector.html;
    }

    /** The headers used in the requests. */
    public get pageHeaders(): object {
        return this.connector.headers;
    }

    /** The list of targetted browsers. */
    public get targetedBrowsers(): Array<string> {
        return this.browserslist;
    }

    /** The list of configured formatters. */
    public get formatters(): Array<IFormatter> {
        return this._formatters;
    }

    /** The max time an event should run. */
    public get timeout(): number {
        return this._timeout;
    }

    private isIgnored(urls: Array<RegExp>, resource: string): boolean {
        if (!urls) {
            return false;
        }

        return urls.some((urlIgnored: RegExp) => {
            return urlIgnored.test(resource);
        });
    }

    public constructor(config: SonarwhalConfig, resources: SonarwhalResources) {
        super({
            delimiter: '::',
            maxListeners: 0,
            wildcard: true
        });

        debug('Initializing sonarwhal engine');
        this._timeout = config.rulesTimeout;
        this.messages = [];
        this.browserslist = config.browserslist;
        this.ignoredUrls = config.ignoredUrls;

        const Connector: IConnectorConstructor = resources.connector;
        const connectorId = config.connector.name;

        if (!Connector) {
            throw new Error(`Connector "${connectorId}" not found`);
        }

        this.connector = new Connector(this, config.connector.options);
        this._formatters = resources.formatters.map((Formatter) => {
            return new Formatter();
        });

        this.parsers = resources.parsers.map((Parser) => {
            debug(`Loading parser`);

            return new Parser(this);
        });

        resources.rules.forEach((Rule) => {
            debug('Loading rules');
            const id = Rule.meta.id;

            this.rules = new Map();

            const ignoreRule = (RuleCtor: IRuleConstructor): boolean => {
                const ignoredConnectors: Array<string> = RuleCtor.meta.ignoredConnectors || [];

                return (connectorId === 'local' && RuleCtor.meta.scope === RuleScope.site) ||
                    (connectorId !== 'local' && RuleCtor.meta.scope === RuleScope.local) ||
                    ignoredConnectors.includes(connectorId);
            };

            // const Rule: IRuleConstructor = rules.get(id);

            const ruleOptions: RuleConfig | Array<RuleConfig> = config.rules[id];
            const severity: Severity = getSeverity(ruleOptions);

            if (ignoreRule(Rule)) {
                debug(`Rule "${id}" is disabled for the connector "${connectorId}"`);
                // TODO: I don't think we should have a dependency on logger here. Maybe send a warning event?
                logger.log(chalk.yellow(`Warning: The rule "${id}" will be ignored for the connector "${connectorId}"`));
            } else if (severity) {
                const context: RuleContext = new RuleContext(id, this, severity, ruleOptions, Rule.meta);
                const rule: IRule = new Rule(context);

                this.rules.set(id, rule);
            } else {
                debug(`Rule "${id}" is disabled`);
            }
        });
    }

    public onRuleEvent(id: string, eventName: string, listener: Function) {
        const that = this;

        const createEventHandler = (handler: Function, ruleId: string) => {
            return function (event: IEvent): Promise<any> {
                const urlsIgnored: Array<RegExp> = that.ignoredUrls.get(ruleId);

                if (that.isIgnored(urlsIgnored, event.resource)) {
                    return null;
                }

                // If a rule is spending a lot of time to finish we should ignore it.

                return new Promise((resolve) => {
                    let immediateId: any;

                    const timeoutId = setTimeout(() => {
                        if (immediateId) {
                            clearImmediate(immediateId);
                            immediateId = null;
                        }

                        debug(`Rule ${ruleId} timeout`);

                        resolve(null);
                    }, that._timeout);

                    immediateId = setImmediate(async () => {
                        const result: any = await handler(event, this.event); // eslint-disable-line no-invalid-this

                        if (timeoutId) {
                            clearTimeout(timeoutId);
                        }

                        resolve(result);
                    });
                });
            };
        };

        this.on(eventName, createEventHandler(listener, id));
    }

    public fetchContent(target: string | url.Url, headers: object): Promise<INetworkData> {
        return this.connector.fetchContent(target, headers);
    }

    public evaluate(source: string) {
        return this.connector.evaluate(source);
    }

    /** Releases any used resource and/or browser. */
    public async close() {
        await this.connector.close();
    }

    /** Reports a message from one of the rules. */
    public report(ruleId: string, severity: Severity, sourceCode: string, location: IProblemLocation, message: string, resource: string) {
        const problem: IProblem = {
            location: location || { column: -1, line: -1 },
            message,
            resource,
            ruleId,
            severity,
            sourceCode
        };

        this.messages.push(problem);
    }

    public clean(fileUrl: url.Url) {
        const file = url.format(fileUrl);

        _.remove(this.messages, (message) => {
            return message.resource === file;
        });
    }

    public clear() {
        this.messages = [];
    }

    public async notify() {
        await this.emitAsync('print', this.messages);
    }

    /** Runs all the configured rules and plugins on a target */
    public async executeOn(target: url.Url): Promise<Array<IProblem>> {

        const start: number = Date.now();

        debug(`Starting the analysis on ${target.path}`);

        await this.connector.collect(target);

        debug(`Total runtime ${Date.now() - start}`);

        return this.messages;
    }

    public querySelectorAll(selector: string): Promise<Array<IAsyncHTMLElement>> {
        return this.connector.querySelectorAll(selector);
    }

    public emitAsync(event: string | Array<string>, ...values: Array<any>): Promise<Array<any>> {
        const ignoredUrls: Array<RegExp> = this.ignoredUrls.get('all');

        if (this.isIgnored(ignoredUrls, values[0].resource)) {
            return Promise.resolve([]);
        }

        return super.emitAsync(event, ...values);
    }
}
