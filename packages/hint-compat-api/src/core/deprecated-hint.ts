import { HintContext } from 'hint/dist/src/lib/hint-context';
import { Events, Event } from 'hint/dist/src/lib/types';

import meta from '../meta/css';
import { APIHint } from './api-hint';
import { CompatNamespace } from '../enums';
import { FeatureInfo, BrowsersInfo } from '../types';
import { SimpleSupportStatement, VersionValue } from '../types-mdn.temp';

export class DeprecatedAPIHint<T extends Events, K extends Event> extends APIHint<T, K> {
    public static readonly meta = meta;

    public constructor(namespaceName: CompatNamespace, context: HintContext<T>) {
        super(namespaceName, context, false);
    }

    public getFeatureVersionValueToAnalyze(browserFeatureSupported: SimpleSupportStatement): VersionValue {
        if (browserFeatureSupported.version_added === false) {
            return true;
        }

        return browserFeatureSupported.version_removed;
    }

    public isVersionValueTestable(version: VersionValue): boolean {
        // If there is no removed version, it is not deprecated.
        return !!version;
    }

    public isVersionValueSupported(version: VersionValue): boolean {
        // Not a common case, but if removed version is exactly true, is always deprecated.
        return version !== true;
    }

    public isSupportedVersion(browser: BrowsersInfo, feature: FeatureInfo, currentVersion: number, version: number) {
        return version < currentVersion;
    }

    public getNotSupportedBrowserMessage(feature: FeatureInfo): string {
        return `${feature.displayableName} is not supported on any of your target browsers.`;
    }

    public getNotSupportedFeatureMessage(featureName: string, browserList: string): string {
        return `${featureName} is not supported on ${browserList}.`;
    }
}
