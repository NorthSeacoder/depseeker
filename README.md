# DepSeeker - Project Dependency Analyzer

[![npm version](https://img.shields.io/npm/v/@nsea/depseeker)](https://www.npmjs.com/package/@nsea/depseeker)
[![License: WTFPL](https://img.shields.io/badge/License-WTFPL-brightgreen.svg)](http://www.wtfpl.net/about/)

A TypeScript library for analyzing project file dependencies with support for ES modules, CommonJS, TypeScript path aliases, and more.

这是一个用于分析项目文件依赖关系的 TypeScript 库，支持 ES 模块、CommonJS、TypeScript 路径别名等。

## Features

- ✅ **Multiple Import Styles**: ES modules (`import`/`export`), CommonJS (`require()`), dynamic imports (`import()`)
- ✅ **TypeScript Support**: Path aliases via `tsconfig.json` with `extends` support
- ✅ **Flexible Configuration**: Custom file extensions, exclusion patterns, and npm package inclusion
- ✅ **Circular Dependencies**: Handles circular references gracefully
- ✅ **Directory Resolution**: Resolves directory imports to `index.*` files
- ✅ **Progress Events**: Optional callbacks for tracking analysis progress
- ✅ **Fast & Cached**: Uses fast-glob for directory scanning and caches file resolutions
- ✅ **Type-safe**: Full TypeScript type definitions included

## Installation

```bash
npm install @nsea/depseeker
# or
yarn add @nsea/depseeker
# or
pnpm add @nsea/depseeker
```

## Quick Start

```typescript
import depseeker from '@nsea/depseeker';

const result = await depseeker('/path/to/project/src', {
  baseDir: '/path/to/project',
  fileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  excludeRegExp: [/node_modules/, /\.test\./],
  tsConfig: 'tsconfig.json',
});

// Get dependency graph
console.log(result.obj());
// {
//   'src/index.ts': ['src/utils.ts', 'src/types.ts'],
//   'src/utils.ts': [],
//   'src/types.ts': []
// }

// Get all analyzed files
console.log(result.getFiles());
// ['src/index.ts', 'src/types.ts', 'src/utils.ts']
```

## API

### `depseeker(filePath, options?): Promise<DepSeekerResult>`

Analyzes dependencies starting from the specified file or directory.

**Parameters:**

- `filePath` (string): Entry file or directory path (absolute or relative to cwd)
- `options` (Options): Configuration options

**Options:**

```typescript
interface Options {
  // Base directory for relative path calculation (default: entry file's directory)
  baseDir?: string;

  // File extensions to analyze (default: ['js', 'jsx', 'ts', 'tsx'])
  fileExtensions?: string[];

  // Regular expressions to exclude files (relative to baseDir)
  excludeRegExp?: RegExp[];

  // Include npm package names in the dependency graph (default: false)
  includeNpm?: boolean;

  // Path to tsconfig.json for path alias resolution
  tsConfig?: string;

  // Babel parser options
  detectiveOptions?: {
    ts?: {
      skipTypeImports?: boolean; // Skip `import type` statements (default: true)
    };
  };

  // Progress callback for long-running analyses
  onProgress?: (event: ProgressEvent) => void;
}
```

**Returns:**

`DepSeekerResult` with the following methods:

- `obj()`: Returns the dependency graph object `{ [file: string]: string[] }`
- `getFiles()`: Returns array of all analyzed files (sorted)
- `toJSON()`: Returns JSON-serializable object with files and graph

### Progress Events

```typescript
type ProgressEvent =
  | { type: 'file:start'; absolutePath: string; relativePath: string }
  | { type: 'file:end'; absolutePath: string; relativePath: string }
  | {
      type: 'file:dependencies';
      absolutePath: string;
      relativePath: string;
      dependencies: string[];
    }
  | {
      type: 'dependency:failed';
      absolutePath: string;
      relativePath: string;
      specifier: string;
      error: Error;
    };
```

## Examples

### Basic Usage

```typescript
import depseeker from '@nsea/depseeker';

const result = await depseeker('./src/index.ts');
console.log(result.obj());
```

### With TypeScript Path Aliases

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@components/*": ["src/components/*"]
    }
  }
}

// Analyze with tsconfig
const result = await depseeker('./src/app.ts', {
  tsConfig: './tsconfig.json',
});
```

### Include npm Packages

```typescript
const result = await depseeker('./src/index.ts', {
  includeNpm: true, // Include external package names
});

// result.obj() will include package names like 'react', 'lodash', etc.
```

### With Progress Tracking

```typescript
const result = await depseeker('./src', {
  onProgress: (event) => {
    if (event.type === 'file:start') {
      console.log(`Analyzing: ${event.relativePath}`);
    } else if (event.type === 'dependency:failed') {
      console.warn(`Failed to analyze ${event.relativePath}: ${event.error.message}`);
    }
  },
});
```

### Custom Extensions and Exclusions

```typescript
const result = await depseeker('./src', {
  fileExtensions: ['vue', 'js', 'ts'],
  excludeRegExp: [/node_modules/, /\.test\./, /\.spec\./, /dist/, /build/],
});
```

## Use Cases

- **Dependency Visualization**: Build graphs for visualization tools
- **Bundle Analysis**: Understand what files are included in your bundles
- **Circular Dependency Detection**: Find and fix circular dependencies
- **Code Refactoring**: Identify impacted files when making changes
- **Documentation**: Generate automated dependency documentation

## Tech Stack

- **@babel/parser & @babel/traverse**: AST-based dependency extraction
- **tsconfig-paths**: TypeScript path alias resolution with extends support
- **fast-glob**: High-performance directory scanning

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test
pnpm test

# Test with coverage
pnpm test:coverage

# Lint
pnpm lint

# Format
pnpm format
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

WTFPL – Do What the Fuck You Want to Public License

See [LICENSE](./LICENSE) for details.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.
