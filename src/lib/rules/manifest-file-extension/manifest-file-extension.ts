/**
 * @fileoverview Check if `.webmanifest` is used as the file extension
 * for the web app manifest file.
 */

// ------------------------------------------------------------------------------
// Requirements
// ------------------------------------------------------------------------------

import * as d from 'debug';
const debug = d('sonar:rules:manifest-file-extension');

import * as path from 'path';

import { Rule, RuleBuilder, ElementFoundEvent } from '../../types'; // eslint-disable-line no-unused-vars
import { RuleContext } from '../../rule-context'; // eslint-disable-line no-unused-vars

// ------------------------------------------------------------------------------
// Public
// ------------------------------------------------------------------------------

const rule: RuleBuilder = {
    create(context: RuleContext): Rule {

        const standardManifestFileExtension = '.webmanifest';

        const validate = async (data: ElementFoundEvent) => {
            const { element, resource } = data;

            if (element.getAttribute('rel') === 'manifest') {
                const href = element.getAttribute('href');
                const fileExtension = path.extname(href);

                if (fileExtension !== standardManifestFileExtension) {
                    debug('Web app manifest file with invalid extension found');

                    const location = await context.findProblemLocation(element, fileExtension);

                    await context.report(resource, element, `The file extension for the web app manifest file ('${href}') should be '${standardManifestFileExtension}' not '${fileExtension}'`, location);
                }
            }
        };

        return { 'element::link': validate };
    },
    meta: {
        docs: {
            category: 'PWA',
            description: 'Use `.webmanifest` as the file extension for the web app manifest file',
            recommended: true
        },
        fixable: 'code',
        schema: []
    }
};

export default rule;
