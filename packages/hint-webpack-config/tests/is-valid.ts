import * as path from 'path';

import { getHintPath, HintLocalTest, testLocalHint } from '@hint/utils-tests-helpers';

const hintPath = getHintPath(__filename, true);

const tests: HintLocalTest[] = [
    {
        name: 'Valid configuration should pass',
        path: path.join(__dirname, 'fixtures', 'valid')
    },
    {
        name: `If there is no config file, it should pass`,
        path: path.join(__dirname, 'fixtures', 'noconfig')
    },
    {
        name: 'Invalid configuration should fail',
        path: path.join(__dirname, 'fixtures', 'invalidconfig'),
        reports: [{ message: `Invalid or unexpected token` }]
    }
];

testLocalHint(hintPath, tests, { parsers: ['webpack-config'] });
