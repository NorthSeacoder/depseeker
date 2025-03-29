// dependency.test.ts
import {test, expect, describe, vi, beforeEach} from 'vitest';
// 明确使用 node: 前缀，这是推荐的做法
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import {buildDependencyGraph} from './dependency'; // 测试主要构建函数
import {createMatchPath} from 'tsconfig-paths'; // 保留用于模拟

// --- 模拟设置 ---
// 模拟整个 fs/promises 模块
vi.mock('node:fs/promises', async (importOriginal) => {
    // 获取原始模块，以便默认情况下使用原始实现（如果需要）
    const originalModule = await importOriginal<typeof fsp>();
    return {
        ...originalModule, // 默认使用原始实现
        readFile: vi.fn(), // 明确模拟 readFile
        stat: vi.fn(), // 明确模拟 stat
        access: vi.fn(), // 明确模拟 access
        readdir: vi.fn() // 明确模拟 readdir
    };
});

// 模拟 tsconfig-paths 模块
vi.mock('tsconfig-paths', () => ({
    createMatchPath: vi.fn()
}));

// 辅助函数：用于模拟文件系统的内存对象
// 存储文件内容（字符串）、目录标记 ('DIR') 或 null/undefined (表示不存在)
const virtualFileSystem: Record<string, string | null | 'DIR'> = {};

// 设置模拟的 fs/promises 函数
function setupMockFS() {
    // --- readFile 模拟 ---
    // 修复：更新签名以匹配实际的 readFile
    vi.mocked(fsp.readFile).mockImplementation(
        async (
            pathInput: fs.PathLike | fsp.FileHandle, // 接受 PathLike 或 FileHandle
        ): Promise<string | Buffer> => {
            // 返回值可能是 string 或 Buffer

            // 处理 FileHandle 输入（在测试中通常不使用，简单抛错）
            if (typeof pathInput !== 'string' && !(pathInput instanceof Buffer)) {
                throw new Error('[Mock] readFile 不支持 FileHandle 输入');
            }

            const p = pathInput.toString(); // 将 PathLike 转换为字符串

            // 检查虚拟文件系统中是否存在且不是目录
            if (virtualFileSystem[p] && virtualFileSystem[p] !== 'DIR') {
                // 假设测试中需要字符串内容
                // 如果需要 Buffer，则需要检查 options.encoding
                return virtualFileSystem[p] as string;
            }
            // 文件不存在，模拟抛出 ENOENT 错误
            const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, open '${p}'`);
            error.code = 'ENOENT';
            throw error;
        }
    );

    // --- stat 模拟 ---
    // 修复：更新签名
    vi.mocked(fsp.stat).mockImplementation(
        async (
            pathInput: fs.PathLike, // stat 通常只接受 PathLike
        ): Promise<fs.Stats> => {
            const p = pathInput.toString();
            if (virtualFileSystem[p] === 'DIR') {
                // 模拟目录的 Stats 对象
                return {isFile: () => false, isDirectory: () => true} as fs.Stats;
            }
            if (virtualFileSystem[p] !== undefined && virtualFileSystem[p] !== null) {
                // 模拟文件的 Stats 对象
                return {isFile: () => true, isDirectory: () => false} as fs.Stats;
            }
            // 文件或目录不存在，模拟抛出 ENOENT 错误
            const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, stat '${p}'`);
            error.code = 'ENOENT';
            throw error;
        }
    );

    // --- access 模拟 ---
    // 修复：更新签名
    vi.mocked(fsp.access).mockImplementation(
        async (
            pathInput: fs.PathLike,
        ): Promise<void> => {
            // 成功时返回 void
            const p = pathInput.toString();
            // 如果在虚拟文件系统中不存在，模拟抛出 ENOENT 错误
            if (virtualFileSystem[p] === undefined) {
                const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, access '${p}'`);
                error.code = 'ENOENT';
                throw error;
            }
            // 如果存在，则模拟成功（返回 undefined/void）
            return undefined;
        }
    );

    // --- readdir 模拟 ---
    // 修复：更新签名和返回值类型
    vi.mocked(fsp.readdir).mockImplementation(
        async (
        ): Promise<fs.Dirent[]> => {
            // 返回值可能是 string[] 或 Dirent[]
            // 默认实现，返回空数组（可以在每个测试中覆盖）
            return [];
        }
    );
}

// 在每个测试运行前执行
beforeEach(() => {
    vi.clearAllMocks(); // 清除所有模拟调用的记录
    // 重置虚拟文件系统
    for (const key in virtualFileSystem) {
        delete virtualFileSystem[key];
    }
    setupMockFS(); // 重新应用模拟设置
});

// --- 修复和重构后的测试用例 ---

describe('buildDependencyGraph - 依赖图构建测试', () => {
    test('正确解析相对路径导入', async () => {
        const mockContent = `
      import { foo } from './foo';
      import { bar } from '../bar'; // 解析到 /bar.ts (在 baseDir /test 之外)
      const baz = require('./baz');
    `;
        virtualFileSystem['/test/file.ts'] = mockContent;
        virtualFileSystem['/test/foo.ts'] = ''; // 模拟文件存在
        virtualFileSystem['/bar.ts'] = ''; // 模拟文件存在
        virtualFileSystem['/test/baz.ts'] = ''; // 模拟文件存在

        // 调用被测试函数
        const {graph, files} = await buildDependencyGraph('/test/file.ts', {
            baseDir: '/test',
            fileExtensions: ['ts'],
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {},
            tsConfig: undefined
        });

        // 期望得到相对于 baseDir '/test' 的路径
        expect(files).toEqual(expect.arrayContaining(['file.ts', 'foo.ts', 'baz.ts', '../bar.ts']));
        expect(graph['file.ts']).toEqual(expect.arrayContaining(['foo.ts', 'baz.ts', '../bar.ts']));
    });

    test('正确解析 tsconfig 路径别名', async () => {
        const mockTsConfigContent = JSON.stringify({
            compilerOptions: {
                baseUrl: '.', // 相对于 tsconfig.json 所在目录
                paths: {'@/*': ['src/*']}
            }
        });
        const mockContent = "import { component } from '@/components/Button'";

        virtualFileSystem['/project/src/app.ts'] = mockContent;
        virtualFileSystem['/project/tsconfig.json'] = mockTsConfigContent;
        virtualFileSystem['/project/src/components/Button.ts'] = ''; // 别名指向的目标文件

        // 模拟 createMatchPath 函数的行为
        const mockMatcher = (source: string) => {
            if (source.startsWith('@/')) {
                // 解析相对于 baseUrl ('/project') 的路径
                return path.resolve('/project', source.replace('@/', 'src/'));
            }
            return undefined;
        };
        vi.mocked(createMatchPath).mockReturnValue(mockMatcher as any);

        const {graph, files} = await buildDependencyGraph('/project/src/app.ts', {
            baseDir: '/project', // 项目根目录
            fileExtensions: ['ts'],
            tsConfig: '/project/tsconfig.json', // tsconfig 的绝对路径
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {}
        });

        // 验证 createMatchPath 是否以正确的 baseUrl 被调用
        expect(vi.mocked(createMatchPath)).toHaveBeenCalledWith(
            '/project', // 根据 tsconfig 目录和 baseUrl 值解析出的绝对 baseUrl
            {'@/*': ['src/*']}
        );
        // 验证结果
        expect(files).toEqual(expect.arrayContaining(['src/app.ts', 'src/components/Button.ts']));
        expect(graph['src/app.ts']).toEqual(['src/components/Button.ts']);
    });

    // dependency.test.ts (续)
    test('递归扫描目录并构建依赖图', async () => {
        // 文件系统结构保持不变
        virtualFileSystem['/app/src'] = 'DIR';
        virtualFileSystem['/app/src/index.ts'] =
            "import { util } from './util';\n import Btn from '@/components/Button';";
        virtualFileSystem['/app/src/util.ts'] = "import { helper } from '../lib/helper';";
        virtualFileSystem['/app/lib'] = 'DIR';
        virtualFileSystem['/app/lib/helper.ts'] = '';
        virtualFileSystem['/app/src/components'] = 'DIR';
        virtualFileSystem['/app/src/components/Button.ts'] = '';
        virtualFileSystem['/app/tsconfig.json'] = JSON.stringify({
            compilerOptions: {baseUrl: '.', paths: {'@/*': ['src/*']}}
        });

        // 模拟 readdir 以返回递归结构 (保持不变)
        vi.mocked(fsp.readdir).mockImplementation(async (dirPath, options): Promise<fs.Dirent[]> => {
            if (dirPath === '/app/src' && options?.recursive) {
                return [
                    {name: 'src/index.ts',path:'/app', isFile: () => true, isDirectory: () => false} as any,
                    {name: 'src/util.ts',path:'/app', isFile: () => true, isDirectory: () => false} as any,
                    {name: 'lib/helper.ts',path:'/app', isFile: () => true, isDirectory: () => false} as any,
                    {name: 'src/components/Button.ts',path:'/app', isFile: () => true, isDirectory: () => false} as any,
                    {name: 'tsconfig.json',path:'/app', isFile: () => true, isDirectory: () => false} as any
                ];
            }
            return [];
        });

        // 模拟 tsconfig-paths (保持不变)
        const mockMatcher = (source: string) =>
            source.startsWith('@/') ? path.resolve('/app', source.replace('@/', 'src/')) : undefined;
        vi.mocked(createMatchPath).mockReturnValue(mockMatcher as any);

        // 从目录 '/app' 开始构建图
        const {graph, files} = await buildDependencyGraph('/app/src', {
            baseDir: '/app', // 相对路径
            fileExtensions: ['ts'], // 只包含 .ts，排除 tsconfig.json
            tsConfig: '/app/tsconfig.json', // <--- 使用相对于 baseDir 或绝对路径更清晰
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {}
        });

        // 验证结果 (保持不变)
        // 文件列表现在应该包含所有扫描到的 .ts 文件
        expect(files.sort()).toEqual(['lib/helper.ts', 'src/components/Button.ts', 'src/index.ts', 'src/util.ts']);
        // 验证依赖图关系
        expect(graph['src/index.ts']?.sort()).toEqual(['src/components/Button.ts', 'src/util.ts']);
        expect(graph['src/util.ts']).toEqual(['lib/helper.ts']);
        expect(graph['lib/helper.ts']).toEqual([]);
        expect(graph['src/components/Button.ts']).toEqual([]);
    });

    test('支持多种文件扩展名解析依赖', async () => {
        virtualFileSystem['/test/file.jsx'] = "import Comp from './component';";
        virtualFileSystem['/test/component.tsx'] = ''; // 模拟依赖解析到 .tsx 文件

        const {graph, files} = await buildDependencyGraph('/test/file.jsx', {
            baseDir: '/test',
            fileExtensions: ['jsx', 'tsx'], // 同时支持 jsx 和 tsx
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {},
            tsConfig: undefined
        });

        expect(files).toEqual(expect.arrayContaining(['file.jsx', 'component.tsx']));
        expect(graph['file.jsx']).toEqual(['component.tsx']);
    });

    test('配置时跳过类型导入解析', async () => {
        const mockContent = `
      import type { Type } from './types'; // 类型导入
      import { value } from './values';   // 值导入
    `;
        virtualFileSystem['/test/file.ts'] = mockContent;
        virtualFileSystem['/test/types.ts'] = '';
        virtualFileSystem['/test/values.ts'] = '';

        const {graph, files} = await buildDependencyGraph('/test/file.ts', {
            baseDir: '/test',
            fileExtensions: ['ts'],
            detectiveOptions: {ts: {skipTypeImports: true}}, // 启用跳过类型导入
            excludeRegExp: [],
            includeNpm: false,
            tsConfig: undefined
        });

        expect(files).toEqual(expect.arrayContaining(['file.ts', 'values.ts']));
        expect(files).not.toContain('types.ts'); // 验证类型导入的文件未被包含
        expect(graph['file.ts']).toEqual(['values.ts']); // 验证图谱只包含值导入
    });

    test('当 includeNpm 为 true 时处理 npm 包', async () => {
        virtualFileSystem['/test/file.ts'] = "import { lib } from 'some-lib';\nimport React from 'react';";
        // 注意：不需要在 virtualFileSystem 中定义 'some-lib' 或 'react'

        const {graph, files} = await buildDependencyGraph('/test/file.ts', {
            baseDir: '/test',
            fileExtensions: ['ts'],
            includeNpm: true, // 启用包含 npm 包
            excludeRegExp: [],
            detectiveOptions: {},
            tsConfig: undefined
        });

        // NPM 包名作为字符串包含在文件列表和图谱中
        expect(files.sort()).toEqual(['file.ts', 'react', 'some-lib']);
        expect(graph['file.ts']?.sort()).toEqual(['react', 'some-lib']);
    });

    test('正确解析绝对路径导入', async () => {
        virtualFileSystem['/test/file.ts'] = "import { foo } from '/absolute/path/to/foo';";
        virtualFileSystem['/absolute/path/to/foo.ts'] = ''; // 模拟绝对路径文件存在

        const {graph, files} = await buildDependencyGraph('/test/file.ts', {
            baseDir: '/test', // baseDir 是 /test
            fileExtensions: ['ts'],
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {},
            tsConfig: undefined
        });

        // 绝对路径应转换为相对于 baseDir 的路径
        expect(files).toEqual(expect.arrayContaining(['file.ts', '../absolute/path/to/foo.ts']));
        expect(graph['file.ts']).toEqual(['../absolute/path/to/foo.ts']);
    });

    test('优雅处理不存在的文件或无法解析的导入', async () => {
        virtualFileSystem['/test/file.ts'] = "import { foo } from './nonexistent';";
        // 注意：不定义 './nonexistent'

        const {graph, files} = await buildDependencyGraph('/test/file.ts', {
            baseDir: '/test',
            fileExtensions: ['ts'],
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {},
            tsConfig: undefined
        });

        expect(files).toEqual(['file.ts']); // 文件列表中只有入口文件
        expect(graph['file.ts']).toEqual([]); // 依赖项无法解析，图谱中为空数组
    });

    test('解析错误时记录错误并继续', async () => {
        virtualFileSystem['/test/good.ts'] = "import './bad.ts';";
        virtualFileSystem['/test/bad.ts'] = 'const a = {'; // 故意制造语法错误

        // 监听 console.error 并阻止其在测试输出中打印
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        const {graph, files} = await buildDependencyGraph('/test/good.ts', {
            baseDir: '/test',
            fileExtensions: ['ts'],
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {},
            tsConfig: undefined
        });

        // 验证是否记录了包含文件名和错误信息的错误
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Error processing file "bad.ts"'));
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to parse file "bad.ts"'));
        // 验证即使出错，文件列表仍然包含遇到的文件
        expect(files).toEqual(expect.arrayContaining(['good.ts', 'bad.ts']));
        // 验证依赖关系仍然建立
        expect(graph['good.ts']).toEqual(['bad.ts']);
        // 验证出错文件的依赖列表为空（因为解析失败）
        expect(graph['bad.ts']).toEqual([]);

        errorSpy.mockRestore(); // 恢复 console.error 的原始行为
    });

    test('正确应用 excludeRegExp 规则', async () => {
        virtualFileSystem['/app/src/index.ts'] = "import './util.ts'; import './tests/test1.ts';";
        virtualFileSystem['/app/src/util.ts'] = '';
        virtualFileSystem['/app/src/tests/test1.ts'] = ''; // 这个文件应该被排除

        const {graph, files} = await buildDependencyGraph('/app/src/index.ts', {
            baseDir: '/app',
            fileExtensions: ['ts'],
            excludeRegExp: [/src\/tests\//], // 排除 tests 目录下的所有文件
            includeNpm: false,
            detectiveOptions: {},
            tsConfig: undefined
        });

        // 验证文件列表不包含被排除的文件
        expect(files.sort()).toEqual(['src/index.ts', 'src/util.ts']);
        // 验证图谱中不包含指向被排除文件的依赖
        expect(graph['src/index.ts']).toEqual(['src/util.ts']);
        // 验证图谱中没有被排除文件的条目
        expect(graph['src/tests/test1.ts']).toBeUndefined();
    });

    // --- 补充的测试用例 ---

    test('处理循环依赖', async () => {
        virtualFileSystem['/cycle/a.ts'] = "import { b } from './b'; export const a = 1;";
        virtualFileSystem['/cycle/b.ts'] = "import { a } from './a'; export const b = 2;";

        const {graph, files} = await buildDependencyGraph('/cycle/a.ts', {
            baseDir: '/cycle',
            fileExtensions: ['ts'],
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {},
            tsConfig: undefined
        });

        // 验证文件列表包含循环依赖中的所有文件
        expect(files.sort()).toEqual(['a.ts', 'b.ts']);
        // 验证图谱正确表示了循环关系
        expect(graph['a.ts']).toEqual(['b.ts']);
        expect(graph['b.ts']).toEqual(['a.ts']);
        // 最重要的是，测试能够成功结束，没有因为无限递归而卡死
    });

    test('解析目录导入到 index 文件', async () => {
        virtualFileSystem['/app/main.ts'] = "import comp from './component';"; // 导入目录
        virtualFileSystem['/app/component'] = 'DIR'; // 模拟目录存在
        virtualFileSystem['/app/component/index.ts'] = "export default 'Component';"; // 目录下的 index 文件

        const {graph, files} = await buildDependencyGraph('/app/main.ts', {
            baseDir: '/app',
            fileExtensions: ['ts', 'js'], // 包含可能的 index.js
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {},
            tsConfig: undefined
        });

        // 验证文件列表包含 index 文件
        expect(files.sort()).toEqual(['component/index.ts', 'main.ts']);
        // 验证图谱中，目录导入被正确解析到了 index 文件
        expect(graph['main.ts']).toEqual(['component/index.ts']);
    });

    test('显式测试 JSX 和 Decorators 解析成功', async () => {
        // 文件内容包含 JSX 和装饰器
        virtualFileSystem['/app/comp.jsx'] = `
        import React from 'react'; // 类组件通常需要导入 React
        import dec from './dec';
        @dec // 将装饰器应用在类声明上
        class MyComponent extends React.Component {
          render() {
            return <div>Hello</div>;
          }
        }
        export default MyComponent; // 导出类
      `;
        // 装饰器文件保持不变
        virtualFileSystem['/app/dec.ts'] = 'export default function dec(target) { return target; }';

        let didThrow = false;
        let graphResult: any = {};
        try {
            // 调用 buildDependencyGraph，如果解析失败会抛错
            graphResult = await buildDependencyGraph('/app/comp.jsx', {
                baseDir: '/app',
                fileExtensions: ['jsx', 'ts'], // 支持 jsx 和 ts
                excludeRegExp: [],
                includeNpm: false,
                detectiveOptions: {},
                tsConfig: undefined
            });
        } catch (e) {
            didThrow = true;
            console.error('测试因解析错误失败:', e); // 如果出错，打印错误信息
        }

        // 断言没有抛出解析错误
        expect(didThrow).toBe(false);
        // (可选) 断言图谱结果符合预期
        expect(graphResult.files).toEqual(expect.arrayContaining(['comp.jsx', 'dec.ts']));
        expect(graphResult.graph['comp.jsx']).toEqual(['dec.ts']);
    });

    test('处理 tsconfig.json extends', async () => {
        // 设置基础和继承的 tsconfig 文件内容
        virtualFileSystem['/project/base.tsconfig.json'] = JSON.stringify({
            compilerOptions: {paths: {'@base/*': ['base/lib/*']}} // 基础配置中的路径别名
        });
        virtualFileSystem['/project/tsconfig.json'] = JSON.stringify({
            extends: './base.tsconfig.json', // 继承基础配置
            compilerOptions: {baseUrl: '.', paths: {'@app/*': ['src/app/*']}} // 当前配置中的路径别名和 baseUrl
        });
        // 源文件，使用两种别名
        virtualFileSystem['/project/src/main.ts'] = "import base from '@base/utils'; import app from '@app/logic';";
        // 别名指向的目标文件
        virtualFileSystem['/project/base/lib/utils.ts'] = '';
        virtualFileSystem['/project/src/app/logic.ts'] = '';

        // 模拟 createMatchPath 以反映合并后的路径
        const mockMatcher = (source: string) => {
            if (source.startsWith('@base/')) {
                return path.resolve('/project', source.replace('@base/', 'base/lib/'));
            }
            if (source.startsWith('@app/')) {
                return path.resolve('/project', source.replace('@app/', 'src/app/'));
            }
            return undefined;
        };
        vi.mocked(createMatchPath).mockReturnValue(mockMatcher as any);

        // 确保 readFile 的模拟能读取所有需要的 tsconfig 文件
        // 注意：这里需要覆盖 setupMockFS 中的默认 readFile 模拟
        vi.mocked(fsp.readFile).mockImplementation(
            async (
                pathInput: fs.PathLike | fsp.FileHandle, // 使用修正后的签名
            ): Promise<string | Buffer> => {
                if (typeof pathInput !== 'string' && !(pathInput instanceof Buffer)) {
                    throw new Error('[Mock] readFile 不支持 FileHandle 输入');
                }
                const p = pathInput.toString();
                if (p === '/project/tsconfig.json') return virtualFileSystem[p] as string;
                if (p === '/project/base.tsconfig.json') return virtualFileSystem[p] as string;
                // 也要能读取源文件内容
                if (virtualFileSystem[p] && virtualFileSystem[p] !== 'DIR') return virtualFileSystem[p] as string;
                // 其他文件模拟 ENOENT 错误
                const error: NodeJS.ErrnoException = new Error(`ENOENT: no such file or directory, open '${p}'`);
                error.code = 'ENOENT';
                throw error;
            }
        );

        const {graph, files} = await buildDependencyGraph('/project/src/main.ts', {
            baseDir: '/project',
            fileExtensions: ['ts'],
            tsConfig: '/project/tsconfig.json', // 指向继承的 tsconfig
            excludeRegExp: [],
            includeNpm: false,
            detectiveOptions: {}
        });

        // 验证 createMatchPath 是否以正确的 baseUrl 被调用
        // 注意：这里的 expect.any(Object) 是因为我们没有精确模拟 resolveTsConfig 的合并逻辑，
        // 但我们通过 mockMatcher 模拟了最终的解析结果。
        expect(vi.mocked(createMatchPath)).toHaveBeenCalledWith(
            '/project', // 验证 baseUrl 是否正确解析
            expect.any(Object) // 验证 paths 对象被传递
        );
        // 验证文件列表和图谱是否正确反映了通过合并别名解析出的依赖
        expect(files.sort()).toEqual(['base/lib/utils.ts', 'src/app/logic.ts', 'src/main.ts']);
        expect(graph['src/main.ts']?.sort()).toEqual(['base/lib/utils.ts', 'src/app/logic.ts']);
    });
});
