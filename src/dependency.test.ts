import {test, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import {getDependencies, buildDependencyGraph} from './dependency';

vi.mock('fs');
vi.mock('fs/promises');

beforeEach(() => {
    vi.resetAllMocks();
});

afterEach(() => {
    vi.clearAllMocks();
});

test('正确解析相对路径导入', async () => {
    const mockContent = `
    import { foo } from './foo';
    import { bar } from '../bar';
    const baz = require('./baz');
  `;
    vi.spyOn(fsp, 'readFile').mockResolvedValue(mockContent);
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
        return typeof filePath === 'string' && filePath.endsWith('.ts');
    });

    const dependencies = await getDependencies('/test/file.ts', {
        baseDir: '/test',
        fileExtensions: ['ts']
    });

    expect(dependencies).toEqual(['/test/foo.ts', '/bar.ts', '/test/baz.ts']);
});

test('正确解析 tsconfig 路径别名', async () => {
    const mockTsConfig = JSON.stringify({
        compilerOptions: {
            baseUrl: '.',
            paths: {
                '@/*': ['src/*']
            }
        }
    });
    const mockContent = "import { component } from '@/components/Button'";

    vi.spyOn(fsp, 'readFile').mockImplementation(async (filePath) => {
        if (filePath === '/test/tsconfig.json') return mockTsConfig;
        return mockContent;
    });
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
        return typeof filePath === 'string' && filePath === '/test/tsconfig.json';
    });
    // 模拟 tsMatchPath
    vi.mock('tsconfig-paths', () => ({
        createMatchPath: () => (source: string) =>
            source.startsWith('@/') ? `/test/${source.replace('@/', 'src/')}.ts` : undefined
    }));

    const dependencies = await getDependencies('/test/file.ts', {
        baseDir: '/test',
        fileExtensions: ['ts'],
        tsConfig: '/test/tsconfig.json'
    });

    expect(dependencies).toContain('src/components/Button.ts');
});

test('正确解析 webpack 路径别名', async () => {
    const mockContent = "import { button } from '@components/Button'";
    const mockWebpackConfig = {
      default: {
          resolve: {
              alias: {
                  '@components': 'src/components'
              },
              extensions: ['.ts']
          }
      }
  };
    vi.doMock('/test/webpack.config.js', () => mockWebpackConfig);
    vi.spyOn(fsp, 'readFile').mockResolvedValue(mockContent);
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
        return typeof filePath === 'string' && (filePath === '/test/webpack.config.js' || filePath.endsWith('.ts'));
    });

    const dependencies = await getDependencies('/test/file.ts', {
        baseDir: '/test',
        fileExtensions: ['ts'],
        webpackConfig: '/test/webpack.config.js'
    });

    expect(dependencies).toContain('src/components/Button.ts');
});

test('递归扫描目录并构建依赖图', async () => {
    const mockFiles = ['src/index.ts', 'src/utils.ts', 'src/components/Button.ts'];
    const mockContentIndex = "import { utils } from './utils'";
    const mockContentUtils = '';
    const mockContentButton = '';

    vi.spyOn(fsp, 'stat').mockResolvedValue({isDirectory: () => true} as fs.Stats);
    vi.spyOn(fsp, 'readdir').mockResolvedValue(mockFiles as any);
    vi.spyOn(fsp, 'readFile').mockImplementation(async (filePath) => {
        if (filePath === '/test/src/index.ts') return mockContentIndex;
        if (filePath === '/test/src/utils.ts') return mockContentUtils;
        if (filePath === '/test/src/components/Button.ts') return mockContentButton;
        return '';
    });
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
        return typeof filePath === 'string' && filePath.endsWith('.ts');
    });

    const {graph, files} = await buildDependencyGraph('/test', {
        baseDir: '/test',
        fileExtensions: ['ts']
    });

    expect(files).toHaveLength(3);
    expect(graph['src/index.ts']).toContain('src/utils.ts');
    expect(graph['src/utils.ts']).toEqual([]);
    expect(graph['src/components/Button.ts']).toEqual([]);
});

test('支持多种文件扩展名解析依赖', async () => {
    const mockContent = "import { component } from './component'";

    vi.spyOn(fsp, 'readFile').mockResolvedValue(mockContent);
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
        return typeof filePath === 'string' && filePath.endsWith('.tsx');
    });

    const dependencies = await getDependencies('/test/file.tsx', {
        baseDir: '/test',
        fileExtensions: ['tsx', 'ts']
    });

    expect(dependencies).toContain('/test/component.tsx');
});

test('配置时跳过类型导入解析', async () => {
    const mockContent = `
    import type { Type } from './types';
    import { value } from './values';
  `;

    vi.spyOn(fsp, 'readFile').mockResolvedValue(mockContent);
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
        return typeof filePath === 'string' && filePath.endsWith('.ts');
    });

    const dependencies = await getDependencies('/test/file.ts', {
        baseDir: '/test',
        fileExtensions: ['ts'],
        detectiveOptions: {ts: {skipTypeImports: true}}
    });

    expect(dependencies).not.toContain('/test/types.ts');
    expect(dependencies).toContain('/test/values.ts');
});

test('当 includeNpm 为 true 时处理 npm 包', async () => {
    const mockContent = "import { lib } from 'some-lib'";

    vi.spyOn(fsp, 'readFile').mockResolvedValue(mockContent);
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const dependencies = await getDependencies('/test/file.ts', {
        baseDir: '/test',
        fileExtensions: ['ts'],
        includeNpm: true
    });

    expect(dependencies).toContain('some-lib');
});

test('正确解析绝对路径导入', async () => {
    const mockContent = "import { foo } from '/absolute/path/to/foo'";

    vi.spyOn(fsp, 'readFile').mockResolvedValue(mockContent);
    vi.spyOn(fs, 'existsSync').mockImplementation((filePath: fs.PathLike) => {
        return typeof filePath === 'string' && filePath.endsWith('.ts');
    });

    const dependencies = await getDependencies('/test/file.ts', {
        baseDir: '/test',
        fileExtensions: ['ts']
    });

    expect(dependencies).toContain('/absolute/path/to/foo.ts');
});

test('优雅处理不存在的文件', async () => {
    const mockContent = "import { foo } from './foo'";

    vi.spyOn(fsp, 'readFile').mockResolvedValue(mockContent);
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    const dependencies = await getDependencies('/test/file.ts', {
        baseDir: '/test',
        fileExtensions: ['ts']
    });

    expect(dependencies).toEqual([]);
});
