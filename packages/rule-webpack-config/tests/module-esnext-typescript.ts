import * as path from 'path';
import * as mock from 'mock-require';

import { getRulePath } from 'hint/dist/src/lib/utils/rule-helpers';
import * as ruleRunner from '@hint/utils-tests-helpers/dist/src/rule-runner';
import { RuleLocalTest } from '@hint/utils-tests-helpers/dist/src/rule-test-type';

import loadJSONFile from 'hint/dist/src/lib/utils/fs/load-json-file';

const webpackDestPath = path.join(__dirname, 'fixtures', 'valid', 'package.json');
const webpackV1DestPath = path.join(__dirname, 'fixtures', 'version1', 'package.json');
const webpackConfig = loadJSONFile(webpackDestPath);
const webpackV1Config = loadJSONFile(webpackV1DestPath);
const rulePath = getRulePath(__filename, true);
const loadPackage = {
    default() {
        return;
    }
};

const tests: Array<RuleLocalTest> = [
    {
        before() {
            loadPackage.default = () => {
                return webpackConfig;
            };

            mock('hint/dist/src/lib/utils/packages/load-package', loadPackage);
        },
        name: 'If TS configuration is valid and webpack version >=2 should pass',
        path: path.join(__dirname, 'fixtures', 'tsvalid')
    },
    {
        before() {
            loadPackage.default = () => {
                return webpackConfig;
            };

            mock('hint/dist/src/lib/utils/packages/load-package', loadPackage);
        },
        name: `If TS configuration is not valid, is should fail`,
        path: path.join(__dirname, 'fixtures', 'tsinvalid'),
        reports: [{ message: 'TypeScript `compilerOptions.module` option should be `esnext`' }]
    },
    {
        before() {
            loadPackage.default = () => {
                return webpackV1Config;
            };

            mock('hint/dist/src/lib/utils/packages/load-package', loadPackage);
        },
        name: 'If TS configuration is invalid, but webpack version is < 2, it should pass',
        path: path.join(__dirname, 'fixtures', 'tsinvalid')
    }
];

const generateTest = (message: string): Array<RuleLocalTest> => {
    return [
        {
            before() {
                loadPackage.default = () => {
                    return webpackConfig;
                };

                mock('hint/dist/src/lib/utils/packages/load-package', loadPackage);
            },
            name: 'Even if TS configuration is valid and webpack version >=2 it should fail',
            path: path.join(__dirname, 'fixtures', 'tsvalid'),
            reports: [{ message }]
        }
    ];
};

ruleRunner.testLocalRule(rulePath, tests, {
    parsers: ['webpack-config', 'typescript-config'],
    serial: true
});
ruleRunner.testLocalRule(rulePath, generateTest('The parser webpack-config should be activated'), {
    parsers: [],
    serial: true
});
ruleRunner.testLocalRule(rulePath, generateTest('The parser typescript-config should be activated'), {
    parsers: ['webpack-config'],
    serial: true
});
