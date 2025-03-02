import depseeker from './src/index';
import * as path from 'path';

const basePath = path.resolve(__dirname, '../examples');
const filePath = path.join(basePath, '2.ts');

const options = {
  includeNpm: false,
  fileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  excludeRegExp: [/\.d\.ts$/, /node_modules/, /dist/, /build/, /coverage/],
  detectiveOptions: { ts: { skipTypeImports: true } },
  baseDir: basePath,
  tsConfig: path.join(basePath, 'tsconfig.json'),
//   webpackConfig: path.join(basePath, 'webpack.config.js'),
};

(async () => {
  const result = await depseeker(filePath, options);
  console.log('Dependency Graph:', result.obj());
  console.log('Files:', result.getFiles());
})();