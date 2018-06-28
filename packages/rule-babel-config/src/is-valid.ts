/**
 * @fileoverview `babel-config/is-valid` warns against providing an invalid babel configuration file.
 */
import { Category } from 'hint/dist/src/lib/enums/category';
import { debug as d } from 'hint/dist/src/lib/utils/debug';
import { IRule, RuleMetadata } from 'hint/dist/src/lib/types';
import { RuleContext } from 'hint/dist/src/lib/rule-context';
import { RuleScope } from 'hint/dist/src/lib/enums/rulescope';

import { BabelConfigInvalidJSON, BabelConfigInvalidSchema } from '@hint/parser-babel-config/dist/src/types';

const debug: debug.IDebugger = d(__filename);

/*
 * ------------------------------------------------------------------------------
 * Public
 * ------------------------------------------------------------------------------
 */
export default class BabelConfigIsValidRule implements IRule {
    public static readonly meta: RuleMetadata = {
        docs: {
            category: Category.development,
            description: `'babel-config/is-valid' warns against providing an invalid babel configuration file \`.babelrc\``
        },
        id: 'babel-config/is-valid',
        schema: [],
        scope: RuleScope.local
    }

    public constructor(context: RuleContext) {
        const invalidJSONFile = async (babelConfigInvalid: BabelConfigInvalidJSON, event: string) => {
            const { error, resource } = babelConfigInvalid;

            debug(`${event} received`);

            await context.report(resource, null, error.message);
        };

        const invalidSchema = async (fetchEnd: BabelConfigInvalidSchema) => {
            const { prettifiedErrors, resource } = fetchEnd;

            debug(`parse::babel-config::error::schema received`);

            for (const error of prettifiedErrors) {
                await context.report(resource, null, error);
            }
        };

        context.on('parse::babel-config::error::json', invalidJSONFile);
        context.on('parse::babel-config::error::circular', invalidJSONFile);
        context.on('parse::babel-config::error::extends', invalidJSONFile);
        context.on('parse::babel-config::error::schema', invalidSchema);
    }
}
