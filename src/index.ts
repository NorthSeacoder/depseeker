// src/index.ts
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { buildDependencyGraph } from './dependency';
import type { DependencyGraph, NormalizedOptions, Options } from './types';

export class DepSeekerResult {
  private readonly _files: string[];
  private readonly _dependencyGraph: DependencyGraph;

  constructor(files: string[], dependencyGraph: DependencyGraph) {
    this._files = files.sort((a, b) => a.localeCompare(b));
    this._dependencyGraph = dependencyGraph;
  }

  obj(): DependencyGraph {
    return this._dependencyGraph;
  }

  getFiles(): string[] {
    return this._files;
  }

  toJSON() {
    return {
      files: this._files,
      dependencyGraph: this._dependencyGraph,
    };
  }
}

const DEFAULT_OPTIONS: Required<Omit<Options, 'baseDir' | 'tsConfig' | 'onProgress'>> = {
  includeNpm: false,
  fileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  excludeRegExp: [/\.d\.ts$/, /node_modules/, /dist/, /build/, /coverage/, /\.test\.tsx?$/, /\.spec\.tsx?$/],
  detectiveOptions: { ts: { skipTypeImports: true } },
};

export default async function depseeker(filePath: string, options: Options = {}): Promise<DepSeekerResult> {
  const absoluteFilePath = path.resolve(filePath);

  let baseDir = options.baseDir;
  if (!baseDir) {
    try {
      const stats = await stat(absoluteFilePath);
      baseDir = stats.isDirectory() ? absoluteFilePath : path.dirname(absoluteFilePath);
    } catch (error: any) {
      console.warn(`[depseeker] Could not stat entry path "${filePath}": ${error.message}`);
      baseDir = path.dirname(absoluteFilePath);
    }
  }

  const finalBaseDir = path.resolve(baseDir);

  const requestedExtensions = options.fileExtensions ?? DEFAULT_OPTIONS.fileExtensions;
  const normalizedExtensions = Array.from(
    new Set(
      requestedExtensions
        .map((ext) => ext.trim())
        .filter((ext) => ext.length > 0)
        .map((ext) => (ext.startsWith('.') ? ext.slice(1) : ext))
        .map((ext) => ext.toLowerCase())
    )
  );
  const effectiveExtensions =
    normalizedExtensions.length > 0 ? normalizedExtensions : [...DEFAULT_OPTIONS.fileExtensions];
  const extensionsWithDot = effectiveExtensions.map((ext) => `.${ext}`);

  const excludeRegExp = options.excludeRegExp ? [...options.excludeRegExp] : [...DEFAULT_OPTIONS.excludeRegExp];
  const detectiveOptions: NormalizedOptions['detectiveOptions'] = {
    ts: {
      ...DEFAULT_OPTIONS.detectiveOptions.ts,
      ...options.detectiveOptions?.ts,
    },
  };

  const normalized: NormalizedOptions = {
    includeNpm: options.includeNpm ?? DEFAULT_OPTIONS.includeNpm,
    fileExtensions: effectiveExtensions,
    extensionsWithDot,
    excludeRegExp,
    detectiveOptions,
    baseDir: finalBaseDir,
    tsConfig: options.tsConfig ? path.resolve(finalBaseDir, options.tsConfig) : undefined,
    onProgress: options.onProgress,
  };

  const { graph, files } = await buildDependencyGraph(absoluteFilePath, normalized);

  return new DepSeekerResult(files, graph);
}

export type {
  Options,
  DependencyGraph,
  ProgressCallback,
  ProgressEvent,
  DetectiveOptions,
  NormalizedOptions,
} from './types';
