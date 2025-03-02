import * as path from 'path';
import { buildDependencyGraph } from './dependency';
import type { Options, DependencyGraph } from './types';

class DepSeeker {
  private files: string[];
  private dependencyGraph: DependencyGraph;

  constructor(files: string[], dependencyGraph: DependencyGraph) {
    this.files = files;
    this.dependencyGraph = dependencyGraph;
  }

  add(filePath: string) {
    this.files.push(filePath);
  }

  obj(): DependencyGraph {
    return this.dependencyGraph;
  }

  getFiles(): string[] {
    return this.files;
  }
}

export default async function depseeker(filePath: string, options: Options = {}): Promise<DepSeeker> {
  const defaultOptions: Options = {
    includeNpm: false,
    fileExtensions: ['js', 'jsx', 'ts', 'tsx'],
    excludeRegExp: [/\.d\.ts$/, /node_modules/, /dist/, /build/, /coverage/],
    detectiveOptions: { ts: { skipTypeImports: true } },
    baseDir: path.dirname(filePath),
    ...options,
  };

  const { graph, files } = await buildDependencyGraph(filePath, defaultOptions);
  return new DepSeeker(files, graph);
}