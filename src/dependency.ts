import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import { createMatchPath } from 'tsconfig-paths';
import type { Options, DependencyGraph, WebpackResolveConfig } from './types';

export async function getDependencies(filePath: string, options: Options): Promise<string[]> {
  const {
    fileExtensions = ['js', 'jsx', 'ts', 'tsx'],
    detectiveOptions = {},
    tsConfig,
    webpackConfig,
  } = options;

  const ext = path.extname(filePath).slice(1);
  if (!fileExtensions.includes(ext)) return [];

  const content = await fsp.readFile(filePath, 'utf8');
  const ast = parse(content, {
    sourceType: 'module',
    plugins: [
      fileExtensions.includes('jsx') || ext === 'jsx' || ext === 'tsx' ? 'jsx' : [],
      fileExtensions.includes('ts') || fileExtensions.includes('tsx') || ext === 'ts' || ext === 'tsx' ? 'typescript' : [],
    ].filter(Boolean) as any[],
  });

  const dependencies: Set<string> = new Set();
  let tsMatchPath: ReturnType<typeof createMatchPath> | undefined;
  let webpackResolveConfig: WebpackResolveConfig = {};

  // TS 配置支持
  if (tsConfig && fs.existsSync(tsConfig)) {
    const tsConfigContent = JSON.parse(await fsp.readFile(tsConfig, 'utf8'));
    const baseUrl = options.baseDir || path.dirname(tsConfig);
    const paths = tsConfigContent.compilerOptions?.paths || {};
    console.log('baseUrl:', baseUrl);
    console.log('baseDir:', options.baseDir);
    console.log('paths:', paths);
    tsMatchPath = createMatchPath(baseUrl, paths);
  }

  // Webpack 配置支持（轻量化）
  if (webpackConfig && fs.existsSync(webpackConfig)) {
    const webpackConfigContent = require(webpackConfig);
    webpackResolveConfig = {
      alias: webpackConfigContent.resolve?.alias || {},
      extensions: webpackConfigContent.resolve?.extensions || fileExtensions.map(ext => `.${ext}`),
    };
  }

  traverse(ast, {
    ImportDeclaration({ node }) {
      const source = node.source.value;
      if (detectiveOptions.ts?.skipTypeImports && node.importKind === 'type') return;
      handleDependency(source, filePath, dependencies, options, tsMatchPath, webpackResolveConfig);
    },
    CallExpression({ node }) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require' && node.arguments[0]?.type === 'StringLiteral') {
        const source = node.arguments[0].value;
        handleDependency(source, filePath, dependencies, options, tsMatchPath, webpackResolveConfig);
      }
    },
  });

  return Array.from(dependencies);
}

function handleDependency(
  source: string,
  filePath: string,
  dependencies: Set<string>,
  options: Options,
  tsMatchPath?: ReturnType<typeof createMatchPath>,
  webpackResolveConfig: WebpackResolveConfig = {},
) {
  console.log('handleDependency:source:', source);
  const { includeNpm = false, excludeRegExp = [], baseDir = '', fileExtensions = ['js', 'jsx', 'ts', 'tsx'] } = options;
  const webpackAlias = webpackResolveConfig.alias || {};
  const webpackExtensions = webpackResolveConfig.extensions || fileExtensions.map(ext => `.${ext}`);

  let resolvedPath: string | undefined;

  // 处理 TS 或 Webpack 别名
  if (!source.startsWith('.') && !includeNpm) {
    if (tsMatchPath) {
      resolvedPath = tsMatchPath(source, undefined, undefined, fileExtensions.map(ext => `.${ext}`));
      console.log('resolvedPath:', resolvedPath);
    } else if (webpackAlias[source]) {
      resolvedPath = path.resolve(baseDir, webpackAlias[source]);
      resolvedPath = resolveFileExtension(resolvedPath, webpackExtensions);
    }
    if (resolvedPath) {
      const relativePath = path.relative(baseDir, resolvedPath);
      if (!excludeRegExp.some(regex => regex.test(relativePath))) {
        dependencies.add(resolvedPath);
      }
    }
    return;
  }

  // 处理相对路径
  resolvedPath = path.resolve(path.dirname(filePath), source);
  const finalPath = resolveFileExtension(resolvedPath, fileExtensions);

  if (!finalPath) return;

  const relativePath = path.relative(baseDir, finalPath);
  if (excludeRegExp.some(regex => regex.test(relativePath))) return;

  dependencies.add(finalPath);
}

function resolveFileExtension(filePath: string, extensions: string[]): string | undefined {
  for (const ext of extensions) {
    const candidate = `${filePath}.${ext}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  if (fs.existsSync(filePath)) return filePath;
  return undefined;
}

export async function buildDependencyGraph(startPath: string, options: Options): Promise<{ graph: DependencyGraph; files: string[] }> {
  const dependencyGraph: DependencyGraph = {};
  const visited = new Set<string>();
  const allFiles = new Set<string>();

  async function traverseDependencies(currentPath: string) {
    if (visited.has(currentPath)) return;
    visited.add(currentPath);

    const dependencies = await getDependencies(currentPath, options);
    const relativePath = path.relative(options.baseDir || '', currentPath);
    dependencyGraph[relativePath] = dependencies.map(dep => path.relative(options.baseDir || '', dep));
    allFiles.add(currentPath);

    for (const dep of dependencies) {
      allFiles.add(dep);
      await traverseDependencies(dep);
    }
  }

  const stats = await fsp.stat(startPath);
  if (stats.isDirectory()) {
    const files = await fsp.readdir(startPath, { recursive: true });
    for (const file of files) {
      if (options.fileExtensions?.some(ext => file.endsWith(`.${ext}`))) {
        await traverseDependencies(path.join(startPath, file));
      }
    }
  } else if (options.fileExtensions?.some(ext => startPath.endsWith(`.${ext}`))) {
    await traverseDependencies(startPath);
  }

  return { graph: dependencyGraph, files: Array.from(allFiles) };
}