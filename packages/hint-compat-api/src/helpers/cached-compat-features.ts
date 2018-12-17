/**
 * @fileoverview Helper to cache features, if we have tested a concrete feature in concrete scenario we are no going to check again.
 */

import { FeatureInfo } from '../types';

export class CachedCompatFeatures {
    private cachedFeatures: Map<string, FeatureInfo> = new Map();

    public add(feature: FeatureInfo): void {
        const key = this.getFeatureKey(feature);

        this.cachedFeatures.set(key, feature);
    }

    public has(feature: FeatureInfo): boolean {
        const key = this.getFeatureKey(feature);

        return this.cachedFeatures.has(key);
    }

    private getFeatureKey(feature: FeatureInfo) {
        let { name, prefix } = feature;

        if (feature.subFeature) {
            name += feature.subFeature.name;
            prefix = feature.subFeature.prefix;
        }

        const featureName = prefix ? prefix + name : name;

        const location = feature.location ?
            feature.location.column.toString() +
                feature.location.line.toString() : '';

        return featureName + location;
    }
}
