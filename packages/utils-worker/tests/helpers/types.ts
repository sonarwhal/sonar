import { HintsConfigObject } from '@hint/utils';
import { Problem } from '@hint/utils-types';

export type CSS = {
    content: string;
    path: string;
};

export type Test = {
    css?: CSS[];
    expectedHints?: string[];
    expectedTime?: number;
    hints?: HintsConfigObject;
    html: string;
    name?: string;
    timeout?: number;
};

export type RunResult = {
    problems: Problem[];
    totalTime: number;
};
