/**
 * @fileoverview Helper that contains all the logic related with CSS compat api, to use in different modules.
 */

import { debug as d } from 'hint/dist/src/lib/utils/debug';
import { StyleParse } from '@hint/parser-css/dist/src/types';
import { ProblemLocation } from 'hint/dist/src/lib/types';
import { AtRule, Rule, Declaration, ChildNode } from 'postcss';
import { find } from 'lodash';
import { FeatureStrategy, MDNTreeFilteredByBrowsers, BrowserSupportCollection, CSSTestFunction } from '../types';

const debug: debug.IDebugger = d(__filename);

export class CompatCSS {
    public testFunction: CSSTestFunction

    public constructor(testFunction: CSSTestFunction) {
        this.testFunction = testFunction;
    }

    private getProblemLocationFromNode(node: ChildNode): ProblemLocation | undefined {
        const start = node.source.start;

        if (!start) {
            return undefined;
        }

        return {
            column: start.column,
            line: start.line
        };
    }

    public searchCSSFeatures(data: MDNTreeFilteredByBrowsers, browsers: BrowserSupportCollection, parse: StyleParse, resource: string): void {
        if (!this.testFunction) {
            debug('Error: You need to provide a testfunction');

            return;
        }

        parse.ast.walk((node: ChildNode) => {
            const strategy = this.chooseStrategyToSearchCSSFeature(node);
            const location = this.getProblemLocationFromNode(node);

            strategy.testFeature(node, data, browsers, resource, location);
        });
    }

    public chooseStrategyToSearchCSSFeature(childNode: ChildNode): FeatureStrategy<ChildNode> {
        const atStrategy: FeatureStrategy<AtRule> = {
            check: (node) => {
                return node.type === 'atrule';
            },

            testFeature: (node: AtRule, data, browsers, resource, location) => {
                this.testFunction('at-rules', node.name, data, browsers, resource, location);
            }
        };

        const ruleStrategy: FeatureStrategy<Rule> = {
            check: (node) => {
                return node.type === 'rule';
            },

            testFeature: (node: Rule, data, browsers, resource, location) => {
                this.testFunction('selectors', node.selector, data, browsers, resource, location);
            }
        };

        const declarationStrategy: FeatureStrategy<Declaration> = {
            check: (node) => {
                return node.type === 'decl';
            },

            testFeature: (node: Declaration, data, browsers, resource, location) => {
                this.testFunction('properties', node.prop, data, browsers, resource, location);
                this.testFunction('properties', node.prop, data, browsers, resource, location, node.value);
            }
        };

        const defaultStrategy: FeatureStrategy<ChildNode> = {
            check: () => {
                return true;
            },

            testFeature: () => { }
        };

        const strategies = {
            atStrategy,
            declarationStrategy,
            ruleStrategy
        };

        const selectedStrategy = find(strategies, (x) => {
            return x.check(childNode);
        });

        // If no result return default strategy to be consistent
        if (!selectedStrategy) {
            debug('Error: Compat api CSS cannot find valid strategies.');

            return defaultStrategy;
        }

        return selectedStrategy as FeatureStrategy<ChildNode>;
    }
}
