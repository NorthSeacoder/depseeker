# DepSeeker - 项目依赖分析工具

这是一个用于分析项目文件依赖关系的工具库，可以构建项目的依赖关系图，支持 TypeScript 路径别名。

This is a tool library for analyzing project file dependencies, capable of building dependency graphs for projects, with support for TypeScript path aliases.

## 技术栈 / Tech Stack

- TypeScript
- Babel Parser (`@babel/parser`, `@babel/traverse`) (用于代码解析 / for code parsing)
- Vitest (用于测试 / for testing)
- tsup (用于构建 / for building)
- tsconfig-paths (用于解析TypeScript路径别名 / for resolving TypeScript path aliases)
- strip-json-comments (用于解析带注释的 tsconfig.json / for parsing tsconfig.json with comments)

## 特性 / Features

- 支持分析 JavaScript 和 TypeScript 项目 (`js`, `jsx`, `ts`, `tsx`) 的依赖关系
- 支持 ES 模块导入 (`import`, `export ... from`, dynamic `import()`)
- 支持 CommonJS 导入 (`require()`)
- 支持解析相对路径导入
- 支持 TypeScript 路径别名（通过 `tsconfig.json`，支持 `extends`）
- 可自定义文件扩展名和排除规则 (`excludeRegExp`)
- 可选择是否包含 npm 包 (`includeNpm`)
- 提供依赖关系图的对象表示 (`obj()`) 和涉及的文件列表 (`getFiles()`)
- 异步、非阻塞操作，利用并行处理提升性能
- 改进的错误处理，提供更清晰的上下文信息

- Supports dependency analysis for JavaScript and TypeScript projects (`js`, `jsx`, `ts`, `tsx`)
- Supports ES Module imports (`import`, `export ... from`, dynamic `import()`)
- Supports CommonJS imports (`require()`)
- Supports relative path import resolution
- Supports TypeScript path aliases (via `tsconfig.json`, including `extends`)
- Customizable file extensions and exclusion rules (`excludeRegExp`)
- Option to include npm packages (`includeNpm`)
- Provides object representation (`obj()`) of dependency graph and list of involved files (`getFiles()`)
- Asynchronous, non-blocking operations with parallel processing for performance
- Improved error handling with clearer context information

## 使用方法 / Usage

1.  **安装依赖 / Install the package**
    ```bash
    npm install @nsea/depseeker
    # 或使用 yarn / or using yarn
    yarn add @nsea/depseeker
    # 或使用 pnpm / or using pnpm
    pnpm add @nsea/depseeker
    ```

2.  **在代码中使用 / Use in your code**
    ```typescript
    import depseeker from '@nsea/depseeker';
    import * as path from 'path';

    async function analyzeDependencies() {
      // 确保提供绝对路径或相对于当前工作目录的路径
      const entryFile = path.resolve(__dirname, '/path/to/your/project/entry/file.ts');
      // 或者分析整个目录
      // const entryDir = path.resolve(__dirname, '/path/to/your/project/src');

      const options = {
        // (可选) 指定项目根目录，用于计算相对路径和解析 TS 别名
        // 默认为入口文件所在目录（如果入口是文件），或入口目录本身（如果入口是目录）
        baseDir: path.resolve(__dirname, '/path/to/your/project'),

        // (可选) 是否包含 npm 包名在依赖列表中 (值为包名，不解析具体文件)
        includeNpm: false,

        // (可选) 要分析的文件扩展名
        fileExtensions: ['js', 'jsx', 'ts', 'tsx'],

        // (可选) 排除文件的正则表达式数组 (相对于 baseDir)
        excludeRegExp: [
          /\.d\.ts$/,        // 排除声明文件
          /node_modules/,   // 排除 node_modules
          /dist|build/,     // 排除构建输出目录
          /coverage/,       // 排除覆盖率报告
          /\.(test|spec)\.(t|j)sx?$/ // 排除测试文件
         ],

        // (可选) 指定 tsconfig.json 文件路径 (相对于 baseDir 或绝对路径)
        // 用于解析路径别名 (compilerOptions.paths 和 baseUrl)
        tsConfig: 'tsconfig.json',

        // (可选) Babel 解析选项
        detectiveOptions: {
          ts: { skipTypeImports: true } // 跳过 TS 类型导入 (import type ...)
        }
      };

      try {
        // 调用 depseeker，传入入口路径和选项
        const result = await depseeker(entryFile, options); // 或 entryDir

        console.log('依赖关系图 (相对路径) / Dependency Graph (relative paths):');
        // 输出格式化的 JSON 图谱
        console.log(JSON.stringify(result.obj(), null, 2));

        console.log('\n涉及文件列表 (相对路径) / Involved Files (relative paths):');
        // 输出所有涉及的文件列表
        console.log(result.getFiles());

      } catch (error) {
        console.error('依赖分析失败 / Dependency analysis failed:', error);
      }
    }

    analyzeDependencies();
    ```

## 开发 / Development

主要开发文件：
- `src/index.ts`: 库的主入口，负责处理选项、调用核心逻辑并返回 `DepSeekerResult` 实例。
- `src/dependency.ts`: 包含依赖分析的核心逻辑，如 `buildDependencyGraph`, `getDirectDependencies`, `resolveDependencyPath`。
- `src/utils.ts`: 提供辅助函数，如 `resolveTsConfig` (递归解析 tsconfig) 和 `resolveFileWithExtensions` (异步文件路径解析)。
- `src/types/index.ts`: 定义 TypeScript 接口和类型。

Main development files:
- `src/index.ts`: Main entry of the library, handles options, calls core logic, and returns the `DepSeekerResult` instance.
- `src/dependency.ts`: Contains the core logic for dependency analysis, such as `buildDependencyGraph`, `getDirectDependencies`, `resolveDependencyPath`.
- `src/utils.ts`: Provides utility functions like `resolveTsConfig` (recursive tsconfig resolution) and `resolveFileWithExtensions` (asynchronous file path resolution).
- `src/types/index.ts`: Defines TypeScript interfaces and types.

## 测试 / Testing

运行 `npm test` 或 `pnpm test` 来执行测试。测试文件应放在 `src` 目录中，并以 `.test.ts` 或 `.spec.ts` 结尾（默认配置下会被排除在依赖分析之外）。

Run `npm test` or `pnpm test` to execute tests. Test files should be placed in the `src` directory and end with `.test.ts` or `.spec.ts` (they are excluded from dependency analysis by default configuration).

## 构建 / Building

使用 `npm run build` 或 `pnpm build` 构建项目。这将使用 `tsup` 生成 CJS 和 ESM 格式的输出文件到 `dist` 目录，并包含类型声明文件 (`.d.ts`)。

Use `npm run build` or `pnpm build` to build the project. This will use `tsup` to generate output files in both CJS and ESM formats into the `dist` directory, along with type declaration files (`.d.ts`).

## 配置选项 / Configuration Options

在调用 `depseeker` 函数时，可以传入一个 `options` 对象，包含以下可选属性：

-   **`baseDir`** (`string`, 可选):
    *   项目的根目录绝对路径。
    *   **作用**:
        *   计算所有返回路径（在 `obj()` 和 `getFiles()` 中）的相对基准。
        *   作为解析 TypeScript `compilerOptions.baseUrl`（如果 `tsconfig.json` 中未指定绝对路径）和相对 `tsConfig` 路径的基础。
    *   **默认值**: 如果入口路径是文件，则默认为该文件所在的目录；如果入口路径是目录，则默认为该目录本身。如果此解析失败或用户未提供，最终会尝试使用当前工作目录。建议显式提供以确保一致性。

-   **`includeNpm`** (`boolean`, 可选, 默认: `false`):
    *   是否将 npm 包（解析为非相对/绝对路径且非 TS 别名的依赖）作为依赖项包含在图中。
    *   如果为 `true`，图中将包含包名字符串（例如 `'react'`），而不是解析到 `node_modules` 内的具体文件。这些 npm 包名也会出现在 `getFiles()` 返回的列表中。

-   **`fileExtensions`** (`string[]`, 可选, 默认: `['js', 'jsx', 'ts', 'tsx']`):
    *   一个字符串数组，定义了需要进行依赖分析的文件扩展名。库在解析导入时也会尝试这些扩展名。

-   **`excludeRegExp`** (`RegExp[]`, 可选, 默认: `[/\.d\.ts$/, /node_modules/, /dist|build/, /coverage/, /\.(test|spec)\.(t|j)sx?$/]`):
    *   一个正则表达式数组。
    *   **作用**: 相对于 `baseDir` 的文件路径如果匹配此数组中的任何一个正则表达式，则该文件将被忽略，不会被解析，也不会出现在最终的图谱和文件列表中。其依赖也不会被递归处理（除非它们通过其他未被排除的路径被引用）。

-   **`tsConfig`** (`string`, 可选):
    *   `tsconfig.json` 文件的路径。可以是绝对路径，也可以是相对于 `baseDir` 的路径。
    *   **作用**: 用于加载 TypeScript 配置，特别是 `compilerOptions.paths` 和 `compilerOptions.baseUrl`，以支持路径别名的解析。支持 `extends` 字段递归解析。如果加载或解析失败，会打印警告，路径别名解析将不可用。

-   **`detectiveOptions`** (`object`, 可选, 默认: `{ ts: { skipTypeImports: true } }`):
    *   传递给底层代码解析逻辑的选项。
    *   目前支持 `ts.skipTypeImports` (boolean): 如果为 `true`，则在解析 TypeScript 文件时会忽略 `import type {...} from '...'` 和 `export type {...} from '...'` 形式的类型导入/导出，不将它们计入依赖关系。

## 依赖说明 / Dependencies

核心运行时依赖包括：
- `@babel/parser`: 用于解析 JavaScript/TypeScript 代码为 AST。
- `@babel/traverse`: 用于遍历 AST 以查找依赖声明。
- `tsconfig-paths`: 用于解析 TypeScript `tsconfig.json` 中的路径别名。
- `strip-json-comments`: 用于在解析 `tsconfig.json` 之前移除其中的注释。

**打包与环境说明 (Packaging and Environment Notes):**

-   `@babel/parser`, `@babel/traverse`, 和 `tsconfig-paths` 是相对较大的库。
-   如果您计划在对打包体积敏感的环境（如 VS Code 扩展、Web Worker 或浏览器）中使用 `depseeker`，强烈建议将这些大型库声明为 **`peerDependencies`** 而不是 `dependencies`。
-   同时，在您的构建配置（例如 `tsup.config.ts` 或 `webpack.config.js`）中，将这些库标记为 **external**，以避免将它们捆绑到您的最终产物中。
-   宿主环境（例如 VS Code 扩展运行时）需要负责提供这些 `peerDependencies`。

## 许可证 / License

请查看 `LICENSE` 文件。
