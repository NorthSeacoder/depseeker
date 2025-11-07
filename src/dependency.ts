import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { parse, type ParserPlugin } from '@babel/parser';
import _traverse from '@babel/traverse';
import { createMatchPath, type MatchPath } from 'tsconfig-paths';
import type { DependencyGraph, NormalizedOptions, ProgressEvent } from './types';
import { loadTsConfig, resolveFileWithExtensions, toProjectRelative } from './utils';

const traverse = (_traverse as any).default ?? _traverse;

interface FileDependency {
  kind: 'file';
  absolutePath: string;
}

interface PackageDependency {
  kind: 'package';
  name: string;
}

type ResolvedDependency = FileDependency | PackageDependency;

export interface BuildResult {
  graph: DependencyGraph;
  files: string[];
}

export async function buildDependencyGraph(startPath: string, options: NormalizedOptions): Promise<BuildResult> {
  const visited = new Set<string>();
  const collectedFiles = new Set<string>();
  const dependencyGraph: DependencyGraph = {};
  const resolutionCache = new Map<string, string | null>();

  let tsMatchPath: MatchPath | undefined;
  if (options.tsConfig) {
    const tsConfigInfo = await loadTsConfig(options.tsConfig);
    if (tsConfigInfo) {
      tsMatchPath = createMatchPath(tsConfigInfo.baseUrl, tsConfigInfo.paths);
    } else {
      emitEvent(options, {
        type: 'dependency:failed',
        absolutePath: options.tsConfig,
        relativePath: toProjectRelative(options.tsConfig, options.baseDir),
        specifier: 'tsconfig-load',
        error: new Error(`Failed to load tsconfig at ${options.tsConfig}`),
      });
    }
  }

  async function walk(filePath: string): Promise<void> {
    if (visited.has(filePath)) {
      return;
    }
    visited.add(filePath);

    const relativePath = toProjectRelative(filePath, options.baseDir);
    collectedFiles.add(relativePath);

    emitEvent(options, { type: 'file:start', absolutePath: filePath, relativePath });

    let resolvedDependencies: ResolvedDependency[] = [];
    try {
      resolvedDependencies = await getDirectDependencies(filePath, options, tsMatchPath, resolutionCache);
    } catch (error: any) {
      emitEvent(options, {
        type: 'dependency:failed',
        absolutePath: filePath,
        relativePath,
        specifier: 'file-processing',
        error,
      });
      dependencyGraph[relativePath] = [];
      emitEvent(options, { type: 'file:end', absolutePath: filePath, relativePath });
      return;
    }

    const allowedDependencies = resolvedDependencies.filter((dep) => {
      if (dep.kind === 'package') {
        return true;
      }
      const relativeDep = toProjectRelative(dep.absolutePath, options.baseDir);
      return !isExcluded(relativeDep, options);
    });

    const graphDependencies = allowedDependencies.map((dep) =>
      dep.kind === 'package' ? dep.name : toProjectRelative(dep.absolutePath, options.baseDir)
    );
    dependencyGraph[relativePath] = graphDependencies;

    emitEvent(options, {
      type: 'file:dependencies',
      absolutePath: filePath,
      relativePath,
      dependencies: graphDependencies,
    });
    emitEvent(options, { type: 'file:end', absolutePath: filePath, relativePath });

    await Promise.all(
      allowedDependencies.map(async (dep) => {
        if (dep.kind === 'package') {
          collectedFiles.add(dep.name);
          return;
        }

        await walk(dep.absolutePath);
      })
    );
  }

  const entryFiles = await collectEntryFiles(startPath, options);
  await Promise.all(entryFiles.map((file) => walk(file)));

  return {
    graph: dependencyGraph,
    files: Array.from(collectedFiles).sort((a, b) => a.localeCompare(b)),
  };
}

async function collectEntryFiles(startPath: string, options: NormalizedOptions): Promise<string[]> {
  let entryStats: Awaited<ReturnType<typeof stat>>;
  try {
    entryStats = await stat(startPath);
  } catch (error: any) {
    throw new Error(`Failed to stat entry path "${startPath}": ${error.message}`);
  }

  if (entryStats.isFile()) {
    if (!hasAllowedExtension(startPath, options)) {
      throw new Error(
        `Entry file "${startPath}" does not match allowed extensions: [${options.fileExtensions.join(', ')}]`
      );
    }
    const relative = toProjectRelative(startPath, options.baseDir);
    if (isExcluded(relative, options)) {
      throw new Error(`Entry file "${relative}" is excluded by excludeRegExp rules`);
    }
    return [startPath];
  }

  if (!entryStats.isDirectory()) {
    throw new Error(`Invalid start path "${startPath}": expected file or directory.`);
  }

  const patterns = options.fileExtensions.map((ext) => `**/*.${ext}`);
  const matches = await fg(patterns, {
    cwd: startPath,
    absolute: true,
    suppressErrors: true,
    followSymbolicLinks: true,
    unique: true,
  });

  const valid = matches.filter((file) => {
    const relative = toProjectRelative(file, options.baseDir);
    return !isExcluded(relative, options);
  });

  return valid.sort((a, b) => a.localeCompare(b));
}

async function getDirectDependencies(
  absoluteFilePath: string,
  options: NormalizedOptions,
  tsMatchPath: MatchPath | undefined,
  resolutionCache: Map<string, string | null>
): Promise<ResolvedDependency[]> {
  if (!hasAllowedExtension(absoluteFilePath, options)) {
    return [];
  }

  let content: string;
  try {
    content = await readFile(absoluteFilePath, 'utf8');
  } catch (error: any) {
    const relative = toProjectRelative(absoluteFilePath, options.baseDir);
    throw new Error(`Failed to read file "${relative}": ${error.message}`);
  }

  const ext = path.extname(absoluteFilePath).slice(1);
  const parserPlugins: ParserPlugin[] = ['jsx', 'decorators-legacy'];
  if (ext === 'ts' || ext === 'tsx') {
    parserPlugins.push('typescript');
  }

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(content, {
      sourceType: 'module',
      plugins: parserPlugins,
    });
  } catch (error: any) {
    const relative = toProjectRelative(absoluteFilePath, options.baseDir);
    throw new Error(`Failed to parse file "${relative}": ${error.message}`);
  }

  const specifiers = new Set<string>();
  const currentDir = path.dirname(absoluteFilePath);

  traverse(ast, {
    ImportDeclaration({ node }: any) {
      if (!node.source?.value) {
        return;
      }
      if (options.detectiveOptions.ts?.skipTypeImports && node.importKind === 'type') {
        return;
      }
      specifiers.add(node.source.value);
    },
    ExportNamedDeclaration({ node }: any) {
      if (!node.source?.value) {
        return;
      }
      if (options.detectiveOptions.ts?.skipTypeImports && node.exportKind === 'type') {
        return;
      }
      specifiers.add(node.source.value);
    },
    ExportAllDeclaration({ node }: any) {
      if (node.source?.value) {
        specifiers.add(node.source.value);
      }
    },
    CallExpression({ node }: any) {
      if (
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        node.arguments.length > 0 &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        specifiers.add(node.arguments[0].value);
      } else if (
        node.callee.type === 'Import' &&
        node.arguments.length > 0 &&
        node.arguments[0].type === 'StringLiteral'
      ) {
        specifiers.add(node.arguments[0].value);
      }
    },
    ImportExpression({ node }: any) {
      if (node.source?.type === 'StringLiteral') {
        specifiers.add(node.source.value);
      }
    },
    TSImportEqualsDeclaration({ node }: any) {
      if (
        node.moduleReference?.type === 'TSExternalModuleReference' &&
        node.moduleReference.expression?.type === 'StringLiteral'
      ) {
        specifiers.add(node.moduleReference.expression.value);
      }
    },
  });

  const resolved: ResolvedDependency[] = [];

  for (const specifier of specifiers) {
    const dependency = await resolveDependency(specifier, currentDir, options, tsMatchPath, resolutionCache);
    if (dependency) {
      resolved.push(dependency);
    }
  }

  return resolved;
}

async function resolveDependency(
  specifier: string,
  currentDir: string,
  options: NormalizedOptions,
  tsMatchPath: MatchPath | undefined,
  resolutionCache: Map<string, string | null>
): Promise<ResolvedDependency | null> {
  if (specifier.startsWith('.')) {
    const candidate = path.resolve(currentDir, specifier);
    const resolved = await resolveFileWithExtensions(candidate, options.extensionsWithDot, resolutionCache);
    return resolved ? { kind: 'file', absolutePath: resolved } : null;
  }

  if (path.isAbsolute(specifier)) {
    const resolved = await resolveFileWithExtensions(specifier, options.extensionsWithDot, resolutionCache);
    return resolved ? { kind: 'file', absolutePath: resolved } : null;
  }

  if (tsMatchPath) {
    const aliasPath = tsMatchPath(specifier, undefined, undefined, options.extensionsWithDot);
    if (aliasPath) {
      const resolved = await resolveFileWithExtensions(aliasPath, options.extensionsWithDot, resolutionCache);
      if (resolved) {
        return { kind: 'file', absolutePath: resolved };
      }
    }
  }

  if (options.includeNpm) {
    return { kind: 'package', name: specifier };
  }

  return null;
}

function hasAllowedExtension(filePath: string, options: NormalizedOptions): boolean {
  return options.extensionsWithDot.some((ext) => filePath.endsWith(ext));
}

function isExcluded(relativePath: string, options: NormalizedOptions): boolean {
  return options.excludeRegExp.some((regex) => regex.test(relativePath));
}

function emitEvent(options: NormalizedOptions, event: ProgressEvent): void {
  if (options.onProgress) {
    options.onProgress(event);
  }
}
