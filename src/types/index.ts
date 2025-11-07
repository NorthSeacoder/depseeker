// src/types/index.ts

export interface DetectiveOptions {
  ts?: {
    skipTypeImports?: boolean;
  };
}

export type ProgressEvent =
  | {
      type: 'file:start' | 'file:end';
      absolutePath: string;
      relativePath: string;
    }
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

export type ProgressCallback = (event: ProgressEvent) => void;

export interface Options {
  includeNpm?: boolean;
  fileExtensions?: string[];
  excludeRegExp?: RegExp[];
  detectiveOptions?: DetectiveOptions;
  baseDir?: string;
  tsConfig?: string;
  onProgress?: ProgressCallback;
}

export interface NormalizedOptions {
  includeNpm: boolean;
  fileExtensions: string[];
  extensionsWithDot: string[];
  excludeRegExp: RegExp[];
  detectiveOptions: DetectiveOptions;
  baseDir: string;
  tsConfig?: string;
  onProgress?: ProgressCallback;
}

export interface DependencyGraph {
  [filePath: string]: string[];
}
