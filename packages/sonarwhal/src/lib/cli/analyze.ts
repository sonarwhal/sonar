import * as inquirer from 'inquirer';
import * as ora from 'ora';

import { SonarwhalConfig, getFilenameForDirectory } from '../config';
import { Sonarwhal } from '../sonarwhal';
import { CLIOptions, IORA, IProblem, Severity, URL } from '../types';
import { debug as d } from '../utils/debug';
import { getAsUris } from '../utils/get-as-uri';
import * as logger from '../utils/logging';
import { cutString } from '../utils/misc';
import * as resourceLoader from '../utils/resource-loader';
import { initSonarwhalrc } from './init';

const debug: debug.IDebugger = d(__filename);

/*
 * ------------------------------------------------------------------------------
 * Private
 * ------------------------------------------------------------------------------
 */

const confirmLaunchInit = (): inquirer.Answers => {
    debug(`Initiating launch init confirm.`);

    const question: Array<object> = [{
        message: `A valid configuration file can't be found. Do you want to create a new one?`,
        name: 'confirm',
        type: 'confirm'
    }];

    return inquirer.prompt(question);
};

const askUserToCreateConfig = async () => {
    const launchInit: inquirer.Answers = await confirmLaunchInit();

    if (!launchInit.confirm) {
        return false;
    }

    await initSonarwhalrc({ init: true } as CLIOptions);
    logger.log(`Configuration file .sonarwhalrc was created.`);

    return true;
};

const tryToLoadConfig = async (actions: CLIOptions): Promise<SonarwhalConfig> => {
    let config: SonarwhalConfig;
    const configPath: string = actions.config || getFilenameForDirectory(process.cwd());

    debug(`Loading configuration file from ${configPath}.`);
    try {
        config = SonarwhalConfig.fromFilePath(configPath, actions);
    } catch (e) {
        logger.log(`Couldn't load a valid configuration file in ${configPath}.`);
        const created = await askUserToCreateConfig();

        if (created) {
            config = await tryToLoadConfig(actions);
        }
    }

    return config;
};

const messages = {
    'fetch::end': '%url% downloaded',
    'fetch::start': 'Downloading %url%',
    'scan::end': 'Finishing...',
    'scan::start': 'Analyzing %url%',
    'traverse::down': 'Traversing the DOM',
    'traverse::end': 'Traversing finished',
    'traverse::start': 'Traversing the DOM',
    'traverse::up': 'Traversing the DOM'
};

const getEvent = (event: string) => {
    if (event.startsWith('fetch::end')) {
        return 'fetch::end';
    }

    return event;
};

const setUpUserFeedback = (sonarwhalInstance: Sonarwhal, spinner: IORA) => {
    sonarwhalInstance.prependAny((event: string, value: { resource: string }) => {
        const message: string = messages[getEvent(event)];

        if (!message) {
            return;
        }

        spinner.text = message.replace('%url%', cutString(value.resource));
    });
};

/*
 * ------------------------------------------------------------------------------
 * Public
 * ------------------------------------------------------------------------------
 */

// HACK: we need this to correctly test the messages in tests/lib/cli.ts.

export let sonarwhal: Sonarwhal = null;

/** Analyzes a website if indicated by `actions`. */
export const analyze = async (actions: CLIOptions): Promise<boolean> => {
    if (!actions._) {
        return false;
    }

    const targets: Array<URL> = getAsUris(actions._);

    if (targets.length === 0) {
        return false;
    }

    const config: SonarwhalConfig = await tryToLoadConfig(actions);

    if (!config) {
        logger.error(`Unable to find a valid configuration file. Please add a .sonarwhalrc file by running 'sonarwhal --init'. `);

        return false;
    }

    const resources = resourceLoader.loadResources(config);

    if (resources.missing.length > 0) {
        logger.error(`The following dependencies are missing:`);
        resources.missing.forEach((dependency) => {
            logger.error(dependency);
        });

        // We should prompt the user if we should install them here
        return false;
    }

    sonarwhal = new Sonarwhal(config, resources);

    const start: number = Date.now();
    const spinner: IORA = ora({ spinner: 'line' });
    let exitCode: number = 0;

    if (!actions.debug) {
        spinner.start();
        setUpUserFeedback(sonarwhal, spinner);
    }

    const endSpinner = (method: string) => {
        if (!actions.debug) {
            spinner[method]();
        }
    };

    const hasError = (reports: Array<IProblem>): boolean => {
        return reports.some((result: IProblem) => {
            return result.severity === Severity.error;
        });
    };

    const print = (reports: Array<IProblem>) => {
        if (hasError(reports)) {
            endSpinner('fail');
        } else {
            endSpinner('succeed');
        }

        sonarwhal.formatters.forEach((formatter) => {
            formatter.format(reports);
        });
    };

    sonarwhal.on('print', print);

    for (const target of targets) {
        try {
            const results: Array<IProblem> = await sonarwhal.executeOn(target);

            if (hasError(results)) {
                exitCode = 1;
            }

            print(results);
        } catch (e) {
            exitCode = 1;
            endSpinner('fail');
            debug(`Failed to analyze: ${target.href}`);
            debug(e);
        }
    }

    await sonarwhal.close();

    debug(`Total runtime: ${Date.now() - start}ms`);

    return exitCode === 0;
};
