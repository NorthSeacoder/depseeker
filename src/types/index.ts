export interface DetectiveOptions {
  ts?: {
    skipTypeImports?: boolean;
  };
}

export interface Options {
  includeNpm?: boolean;
  fileExtensions?: string[];
  excludeRegExp?: RegExp[];
  detectiveOptions?: DetectiveOptions;
  baseDir?: string;
  tsConfig?: string;
  webpackConfig?: string;
}

export interface DependencyGraph {
  [filePath: string]: string[];
}

export interface WebpackResolveConfig {
  alias?: { [key: string]: string };
  extensions?: string[];
}