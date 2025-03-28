// src/types/index.ts
export interface DetectiveOptions {
  ts?: {
    skipTypeImports?: boolean;
  };
}

// 移除 webpackConfig
export interface Options {
  includeNpm?: boolean;
  fileExtensions?: string[];
  excludeRegExp?: RegExp[];
  detectiveOptions?: DetectiveOptions;
  baseDir?: string; // 项目根目录，用于计算相对路径和解析 TS 别名
  tsConfig?: string; // tsconfig.json 文件路径
}

export interface DependencyGraph {
  [filePath: string]: string[]; // key 是相对于 baseDir 的路径, value 是其依赖项相对于 baseDir 的路径数组
}

// 解析错误信息结构 (可选，用于更清晰地报告错误)
export interface ResolutionError {
  file: string; // 出错的文件 (相对路径)
  dependency: string; // 无法解析的依赖字符串
  error: string; // 错误信息
}
