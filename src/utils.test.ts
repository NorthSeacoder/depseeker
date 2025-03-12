import {test, expect} from 'vitest';
import {resolveTsConfig} from './utils';
test('resolveTsConfig', async () => {
    const tsConfig = await resolveTsConfig('./tsconfig.json');
    expect(tsConfig).toBeDefined();
    expect(tsConfig.compilerOptions).toBeDefined();
});
