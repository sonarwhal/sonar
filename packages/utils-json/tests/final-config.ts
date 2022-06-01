import anyTest, { TestFn, ExecutionContext } from 'ava';
import * as sinon from 'sinon';
import * as proxyquire from 'proxyquire';

import { IParsingError, IFilePathError } from '../src/types';

const baseConfig = {
    compilerOptions: {
        noImplicitAny: true,
        strictNullChecks: true
    }
};


type FileModule = {
    extends: string | null;
    name: string;
};

type LoadJSONFileModule = () => FileModule | typeof baseConfig | null;

type AsPathString = () => string;

type ParserContext = {
    asPathString: AsPathString;
    loadJSONFileModule: LoadJSONFileModule;
    resolve: () => string;
    sandbox: sinon.SinonSandbox;
};

const test = anyTest as TestFn<ParserContext>;

const asUri = { getAsUri() { } };

const initContext = (t: ExecutionContext<ParserContext>) => {
    t.context.loadJSONFileModule = (): FileModule | null => {
        return null;
    };

    t.context.asPathString = (): string => {
        return '';
    };

    t.context.resolve = (): string => {
        return '';
    };
    t.context.sandbox = sinon.createSandbox();
};

const loadScript = (context: ParserContext) => {
    const script: typeof import('../src/final-config') = proxyquire('../src/final-config', {
        './export-require': { importedRequire: { resolve: context.resolve }},
        '@hint/utils-fs': { loadJSONFile: context.loadJSONFileModule },
        '@hint/utils-network': {
            asPathString: context.asPathString,
            asUri
        }
    });

    return script.finalConfig;
};

test.beforeEach(initContext);

test.afterEach.always((t) => {
    t.context.sandbox.restore();
});

test(`If config doesn't have an extends property, it should return the same object`, (t) => {
    const finalConfig = loadScript(t.context);
    const config = { extends: '' };

    const result = finalConfig(config, 'resource');

    t.true(config === result);
});

test('If there is a circular reference, it should return an instance of an Error', (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context, 'asPathString').returns('circularReference');
    sandbox.stub(t.context, 'resolve').returns('circularReference');

    const finalConfig = loadScript(t.context);
    const config = { extends: 'circularReference' };

    const result = finalConfig(config, 'circularReference') as IParsingError;

    t.true(result instanceof Error);
    t.is(result.message, 'Circular reference found in file circularReference');
});

test('If one of the extended files is not a valid JSON, it should return an instance of an Error', (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context, 'asPathString').returns('valid-with-invalid-extends');
    sandbox.stub(t.context, 'resolve').returns('invalid-extends');
    sandbox.stub(t.context, 'loadJSONFileModule').throws(new Error('InvalidJSON'));

    const finalConfig = loadScript(t.context);

    const config = { extends: 'invalid-extends' };

    const result = finalConfig(config, 'valid-with-invalid-extends') as IParsingError;

    t.true(result instanceof Error);
});

test(`If one of the extended files is not a valid JSON location, it should return a MODULE_NOT_FOUND error`, (t) => {
    const customError = new Error('customError') as IFilePathError;

    customError.code = 'MODULE_NOT_FOUND';

    const sandbox = t.context.sandbox;
    const config = { extends: '@tsconfig/strictest/tsconfig.json' };

    sandbox.stub(t.context, 'resolve').throws(customError);
    const finalConfig = loadScript(t.context);
    const result = finalConfig(config, 'resource');

    t.true(result && (result as IFilePathError).code === 'MODULE_NOT_FOUND');
});

test(`If one of the extended files is a JSON module, it should inherit from it`, (t) => {
    const userPath = '/home/user/packages/utils-json/node_modules/@tsconfig/strictest/tsconfig.json';
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context, 'resolve').returns(userPath);
    sandbox.stub(t.context, 'loadJSONFileModule').returns(baseConfig);

    const finalConfig = loadScript(t.context);

    const config = { extends: '@tsconfig/strictest/tsconfig.json' };

    const result = finalConfig(config, 'resource');

    t.true(typeof result === typeof baseConfig);
    t.true((result as unknown as typeof baseConfig).compilerOptions.noImplicitAny ===
        baseConfig.compilerOptions.noImplicitAny);
});

test(`If one of the extended files is a JSON module, it should merge both properties`, (t) => {
    const userPath = '/home/user/packages/utils-json/node_modules/@tsconfig/strictest/tsconfig.json';
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context, 'resolve').returns(userPath);
    sandbox.stub(t.context, 'loadJSONFileModule').returns(baseConfig);

    const finalConfig = loadScript(t.context);

    const config = {
        checkJs: true,
        extends: '@tsconfig/strictest/tsconfig.json'
    };

    const result = finalConfig(config, 'resource');

    t.true((result as any).checkJs);
});

test('If everything is ok, it should merge all the extended configurations', (t) => {
    const sandbox = t.context.sandbox;

    sandbox.stub(t.context, 'asPathString').returns('valid-with-extends');
    sandbox.stub(t.context, 'resolve')
        .onFirstCall()
        .returns('valid-extends')
        .onSecondCall()
        .returns('valid-extends-2');

    const miscStub = sandbox.stub(t.context, 'loadJSONFileModule')
        .onFirstCall()
        .returns({
            extends: 'valid-extends-2',
            name: 'valid-extends'
        })
        .onSecondCall()
        .returns({
            extends: null,
            name: 'valid-extends-2'
        });

    const finalConfig = loadScript(t.context);

    const config = {
        extends: 'valid-extends',
        name: 'valid'
    };

    const result = finalConfig(config, 'valid-with-extends');

    t.true(miscStub.calledTwice);
    t.is(result && result.name, 'valid');
});
