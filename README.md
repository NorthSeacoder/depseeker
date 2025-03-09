# DepSeeker - 项目依赖分析工具

这是一个用于分析项目文件依赖关系的工具库，可以构建项目的依赖关系图，支持TypeScript和Webpack配置。

This is a tool library for analyzing project file dependencies, capable of building dependency graphs for projects, with support for TypeScript and Webpack configurations.

## 技术栈 / Tech Stack

- TypeScript
- Babel Parser (用于代码解析 / for code parsing)
- Vitest (用于测试 / for testing)
- tsup (用于构建 / for building)
- tsconfig-paths (用于解析TypeScript路径别名 / for resolving TypeScript path aliases)

## 特性 / Features

- 支持分析JavaScript和TypeScript项目的依赖关系
- 支持解析相对路径导入
- 支持TypeScript路径别名（通过tsconfig.json）
- 支持Webpack别名配置
- 可自定义文件扩展名和排除规则
- 提供依赖关系图的对象表示

- Supports dependency analysis for JavaScript and TypeScript projects
- Supports relative path imports resolution
- Supports TypeScript path aliases (via tsconfig.json)
- Supports Webpack alias configurations
- Customizable file extensions and exclusion rules
- Provides object representation of dependency graphs

## 使用方法 / Usage

1. 安装依赖 / Install the package
   ```bash
   npm install @nsea/depseeker
   # 或使用 yarn / or using yarn
   yarn add @nsea/depseeker
   # 或使用 pnpm / or using pnpm
   pnpm add @nsea/depseeker
   ```

2. 在代码中使用 / Use in your code
   ```typescript
   import depseeker from '@nsea/depseeker';
   
   async function analyzeDependencies() {
     const entryFile = '/path/to/your/entry/file.ts';
     const options = {
       includeNpm: false,
       fileExtensions: ['js', 'jsx', 'ts', 'tsx'],
       excludeRegExp: [/\.d\.ts$/, /node_modules/, /dist/],
       tsConfig: '/path/to/tsconfig.json',  // 可选 / optional
       webpackConfig: '/path/to/webpack.config.js'  // 可选 / optional
     };
     
     const result = await depseeker(entryFile, options);
     console.log('依赖关系图 / Dependency Graph:', result.obj());
     console.log('文件列表 / File List:', result.getFiles());
   }
   
   analyzeDependencies().catch(console.error);
   ```

## 开发 / Development

主要开发文件：
- `src/index.ts`: 库的主入口
- `src/dependency.ts`: 依赖分析的核心逻辑
- `src/types/`: 类型定义

Main development files:
- `src/index.ts`: Main entry of the library
- `src/dependency.ts`: Core logic for dependency analysis
- `src/types/`: Type definitions

## 测试 / Testing

运行 `npm test` 来执行测试。测试文件应放在 `src` 目录中，并以 `.test.ts` 结尾。

Run `npm test` to execute tests. Test files should be placed in the `src` directory and end with `.test.ts`.

## 构建 / Building

使用 `npm run build` 构建项目。这将生成 CJS 和 ESM 格式的输出文件。

Use `npm run build` to build the project. This will generate output files in both CJS and ESM formats.

## 配置选项 / Configuration Options

在调用 `depseeker` 函数时，可以传入以下选项：

- `includeNpm`: 是否包含npm包依赖（默认：false）
- `fileExtensions`: 要分析的文件扩展名数组（默认：['js', 'jsx', 'ts', 'tsx']）
- `excludeRegExp`: 排除文件的正则表达式数组
- `detectiveOptions`: 代码解析选项
- `baseDir`: 基础目录路径
- `tsConfig`: TypeScript配置文件路径
- `webpackConfig`: Webpack配置文件路径

When calling the `depseeker` function, you can pass the following options:

- `includeNpm`: Whether to include npm package dependencies (default: false)
- `fileExtensions`: Array of file extensions to analyze (default: ['js', 'jsx', 'ts', 'tsx'])
- `excludeRegExp`: Array of regular expressions to exclude files
- `detectiveOptions`: Code parsing options
- `baseDir`: Base directory path
- `tsConfig`: Path to TypeScript configuration file
- `webpackConfig`: Path to Webpack configuration file

## 依赖说明 / Dependencies

主要依赖包括：
- `@babel/parser`: 用于解析JavaScript/TypeScript代码
- `@babel/traverse`: 用于遍历AST
- `tsconfig-paths`: 用于解析TypeScript路径别名

Main dependencies include:
- `@babel/parser`: For parsing JavaScript/TypeScript code
- `@babel/traverse`: For traversing AST
- `tsconfig-paths`: For resolving TypeScript path aliases

## 许可证 / License

请查看 `LICENSE` 文件。

Please see the `LICENSE` file.
