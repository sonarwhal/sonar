import * as _ from 'lodash';
import * as proxyquire from 'proxyquire';
import * as sinon from 'sinon';
import test from 'ava';

import { CLIOptions, NpmPackage } from '../../../src/lib/types';

const actions = ({ init: true } as CLIOptions);
const inquirer = { prompt() { } };
const stubBrowserslistObject = { generateBrowserslistConfig() { } };
const resourceLoader = {
    getCoreResources() { },
    getInstalledResources() { }
};
const child = { spawnSync() { } };
const fs = {
    existsSync() { },
    writeFile() { }
};
const logger = {
    error() { },
    log() { }
};

const npm = {
    getOfficialPackages() { },
    installPackages() { }
};

const promisifyObject = { promisify() { } };

const stubUtilObject = {
    promisify() {
        return promisifyObject.promisify;
    }
};

proxyquire('../../../src/lib/cli/init', {
    '../utils/logging': logger,
    '../utils/npm': npm,
    '../utils/resource-loader': resourceLoader,
    './browserslist': stubBrowserslistObject,
    child_process: child, // eslint-disable-line camelcase
    fs,
    inquirer,
    util: stubUtilObject
});

import { initSonarwhalrc } from '../../../src/lib/cli/init';

test.beforeEach((t) => {
    sinon.stub(promisifyObject, 'promisify').resolves();
    sinon.stub(stubBrowserslistObject, 'generateBrowserslistConfig').resolves([]);
    sinon.spy(stubUtilObject, 'promisify');

    t.context.util = stubUtilObject.promisify;
    t.context.promisify = promisifyObject.promisify;
    t.context.browserslistGenerator = stubBrowserslistObject.generateBrowserslistConfig;
});

test.afterEach.always((t) => {
    t.context.util.restore();
    t.context.promisify.restore();
    t.context.browserslistGenerator.restore();
});

const formatters = [
    'formatter1',
    'formatter2'
];

const installedRules = [
    '@sonarwhal/rule-rule1',
    '@sonarwhal/rule-rule2'
];

const installedConnectors = [
    'installedConnector1',
    'installedConnector2'
];

const installedParsers = [];

test.serial('initSonarwhalrc should install the configuration package if user chooses a recommended configuration', async (t) => {
    const sandbox = sinon.sandbox.create();
    const initAnswers = { configType: 'predefined' };
    const configAnswer = { configuration: '@sonarwhal/configuration-recommended' };

    sandbox.stub(npm, 'getOfficialPackages').resolves([{
        date: null,
        description: '',
        keywords: [],
        maintainers: [],
        name: '@sonarwhal/configuration-recommended',
        version: '1.0.0'
    }] as Array<NpmPackage>);

    const stub = sandbox.stub(npm, 'installPackages').returns(true);

    sandbox.stub(inquirer, 'prompt')
        .onFirstCall()
        .resolves(initAnswers)
        .onSecondCall()
        .resolves(configAnswer);

    await initSonarwhalrc(actions);

    const fileData = JSON.parse(t.context.promisify.args[0][1]);

    t.true(stub.called, `npm hasn't tried to install any package`);
    t.true(_.isEqual(fileData, { extends: [configAnswer.configuration] }));

    sandbox.restore();
});


test.serial(`"inquirer.prompt" should use the installed resources if the user doesn't want a predefined configuration`, async (t) => {
    const sandbox = sinon.sandbox.create();
    const answers = {
        connector: 'jsdom',
        default: '',
        formatter: 'json',
        rules: ['rule1', 'rule2']
    };

    sandbox.stub(resourceLoader, 'getInstalledResources')
        .onFirstCall()
        .returns(installedConnectors)
        .onSecondCall()
        .returns(formatters)
        .onThirdCall()
        .returns(installedParsers)
        .onCall(3)
        .returns(installedRules);

    sandbox.stub(resourceLoader, 'getCoreResources').returns([]);

    const initAnswers = { configType: 'custom' };

    sandbox.stub(inquirer, 'prompt')
        .onFirstCall()
        .resolves(initAnswers)
        .onSecondCall()
        .resolves(answers);

    await initSonarwhalrc(actions);

    const questions = (inquirer.prompt as sinon.SinonStub).args[1][0];

    t.is(questions[0].choices.length, installedConnectors.length);
    t.is(questions[1].choices.length, formatters.length);
    t.is(questions[2].choices.length, installedRules.length);

    const fileData = JSON.parse(t.context.promisify.args[0][1]);

    t.is(fileData.connector.name, answers.connector);
    t.deepEqual(fileData.rules, {
        rule1: 'error',
        rule2: 'error'
    });
    t.deepEqual(fileData.formatters, [answers.formatter]);

    sandbox.restore();
});

test.serial(`if instalation of a config package fails, "initSonarwhalrc" returns true`, async (t) => {
    const sandbox = sinon.sandbox.create();
    const initAnswers = { configType: 'predefined' };
    const configAnswer = { configuration: '@sonarwhal/configuration-recommended' };

    sandbox.stub(npm, 'getOfficialPackages').resolves([{
        date: null,
        description: '',
        keywords: [],
        maintainers: [],
        name: '@sonarwhal/configuration-recommended',
        version: '1.0.0'
    }] as Array<NpmPackage>);

    sandbox.stub(npm, 'installPackages').returns(false);

    sandbox.stub(inquirer, 'prompt')
        .onFirstCall()
        .resolves(initAnswers)
        .onSecondCall()
        .resolves(configAnswer);

    const result = await initSonarwhalrc(actions);

    t.true(result, `initSonarwhalrc doesn't return true if installation of resources fails`);

    sandbox.restore();
});

test.serial('If init is not an option, it should return false', async (t) => {
    const result = await initSonarwhalrc(({}) as CLIOptions);

    t.false(result);
});
