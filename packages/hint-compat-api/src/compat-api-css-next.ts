/**
 * @fileoverview Hint to validate if the CSS features of the project are not broadly supported
 */

import { HintContext } from 'hint/dist/src/lib/hint-context';
import { IHint, ProblemLocation } from 'hint/dist/src/lib/types';
import { StyleParse, StyleEvents } from '@hint/parser-css/dist/src/types';
import { CompatApi, userBrowsers, CompatCSS } from './helpers';
import { BrowserSupportCollection } from './types';
import { SimpleSupportStatement, SupportStatement } from './types-mdn.temp';
import { browserVersions } from './helpers/normalize-version';

import meta from './meta/compat-api-css';

/*
 * ------------------------------------------------------------------------------
 * Public
 * ------------------------------------------------------------------------------
 */

type UserPrefixes = {
    [key: string]: boolean;
};

export default class implements IHint {
    public static readonly meta = meta;

    private mdnBrowsersCollection: BrowserSupportCollection;
    private compatApi: CompatApi;
    private compatCSS: CompatCSS;
    private userPrefixes: UserPrefixes = {};

    public constructor(context: HintContext<StyleEvents>) {
        const isCheckingNotBroadlySupported = true;

        this.mdnBrowsersCollection = userBrowsers.convert(context.targetedBrowsers);
        this.compatApi = new CompatApi('css', this.mdnBrowsersCollection, isCheckingNotBroadlySupported);
        this.compatCSS = new CompatCSS(context, (...params) => {
            this.testFeatureIsSupportedInBrowser(...params);
        });

        context.on('parse::end::css', async (styleParse: StyleParse) => {
            await this.onParseCSS(styleParse);
        });
    }

    private async onParseCSS(styleParse: StyleParse): Promise<void> {
        const { resource } = styleParse;

        this.compatCSS.setResource(resource);
        await this.compatCSS.searchCSSFeatures(this.compatApi.compatDataApi, this.mdnBrowsersCollection, styleParse);
    }

    private async testFeatureIsSupportedInBrowser(browsersToSupport: BrowserSupportCollection, browserToSupportName: string, browserInfo: SupportStatement, featureName: string, prefix?: string, location?: ProblemLocation): Promise<void> {
        if (!this.compatApi.isBrowserToSupportPartOfBrowsersCollection(browsersToSupport, browserToSupportName)) {
            return;
        }

        const browserFeatureSupported = this.compatApi.getSupportStatementFromInfo(browserInfo, prefix);

        if (!browserFeatureSupported) {
            const message = `${featureName} of CSS was never added on any of your browsers to support.`;

            await this.compatCSS.reportIfThereIsNoInformationAboutCompatibility(message, browsersToSupport, browserToSupportName, featureName, location);

            return;
        }

        await this.testAddedVersionByBrowsers(browsersToSupport, browserFeatureSupported, browserToSupportName, featureName, location, prefix);
    }

    private async testAddedVersionByBrowsers(browsersToSupport: BrowserSupportCollection, browserFeatureSupported: SimpleSupportStatement, browserToSupportName: string, featureName: string, location?: ProblemLocation, prefix?: string): Promise<void> {
        const addedVersion = browserFeatureSupported.version_added;

        // If `addedVersion` is true, it means the property has always been implemented
        if (addedVersion === true) {
            return;
        }

        // Not a common case, but if added version does not exist, was not added.
        if (!addedVersion) {
            const message = `${featureName} of CSS is not supported on ${browserToSupportName} browser.`;

            await this.compatCSS.reportError(featureName, message, location);

            return;
        }

        await this.testNotSupportedVersionsByBrowsers(browsersToSupport, addedVersion, browserToSupportName, featureName, location, prefix);
    }

    private async testNotSupportedVersionsByBrowsers(browsersToSupport: BrowserSupportCollection, addedVersion: string, browserToSupportName: string, featureName: string, location?: ProblemLocation, prefix?: string): Promise<void> {
        const addedVersionNumber = browserVersions.normalize(addedVersion);

        const notSupportedVersions = this.getNotSupportedVersionByBrowsers(browsersToSupport, browserToSupportName, addedVersionNumber, featureName, prefix);

        if (notSupportedVersions.length > 0) {
            const message = this.compatCSS.generateNotSupportedVersionsError(featureName, notSupportedVersions, 'added', prefix);

            await this.compatCSS.reportError(featureName, message, location);
        }
    }

    private getNotSupportedVersionByBrowsers(browsersToSupport: BrowserSupportCollection, browserToSupportName: string, addedVersionNumber: number, featureName: string, prefix?: string): string[] {
        const isBrowserDefined: boolean = !!browsersToSupport[browserToSupportName];
        const isPrefixInUse: boolean = !prefix && this.checkUserUsedPrefixes(browserToSupportName, featureName);
        const versions: number[] = isBrowserDefined && !isPrefixInUse ? browsersToSupport[browserToSupportName] : [];

        return versions
            .filter((version: number) => {
                const isVersionGreaterThanAddedVersion: boolean = version >= addedVersionNumber;

                if (isVersionGreaterThanAddedVersion && prefix) {
                    this.addUserUsedPrefixes(browserToSupportName, featureName);
                }

                return !isVersionGreaterThanAddedVersion;
            })
            .map((version: number) => {
                return `${browserToSupportName} ${browserVersions.deNormalize(version)}`;
            });
    }

    private addUserUsedPrefixes(browserName: string, featureName: string): void {
        this.userPrefixes[browserName + featureName] = true;
    }

    private checkUserUsedPrefixes (browserName: string, featureName: string): boolean {
        return this.userPrefixes[browserName + featureName];
    }
}
