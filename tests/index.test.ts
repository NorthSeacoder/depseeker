import { describe, expect, it } from 'vitest';
import path from 'node:path';
import depseeker from '../src/index';
import type { ProgressEvent } from '../src/types';
import { withFixture } from './helpers';

describe('depseeker', () => {
  it('analyzes simple relative imports', async () => {
    await withFixture(
      {
        'main.ts': `import {helper} from './utils';\nexport const app = helper();`,
        'utils.ts': `export const helper = () => 'hello';`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'main.ts'), { baseDir: root });
        const files = result.getFiles();
        const graph = result.obj();

        expect(files.sort()).toEqual(['main.ts', 'utils.ts']);
        expect(graph['main.ts']).toEqual(['utils.ts']);
        expect(graph['utils.ts']).toEqual([]);
      }
    );
  });

  it('handles npm packages when includeNpm is true', async () => {
    await withFixture(
      {
        'app.ts': `import React from 'react';\nimport {util} from './util';\nconsole.log(React, util);`,
        'util.ts': `export const util = 42;`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'app.ts'), {
          baseDir: root,
          includeNpm: true,
        });
        const files = result.getFiles();
        const graph = result.obj();

        expect(files.sort()).toEqual(['app.ts', 'react', 'util.ts']);
        expect(graph['app.ts'].sort()).toEqual(['react', 'util.ts']);
      }
    );
  });

  it('ignores npm packages when includeNpm is false', async () => {
    await withFixture(
      {
        'app.ts': `import React from 'react';\nimport {util} from './util';\nconsole.log(React, util);`,
        'util.ts': `export const util = 42;`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'app.ts'), {
          baseDir: root,
          includeNpm: false,
        });
        const files = result.getFiles();
        const graph = result.obj();

        expect(files.sort()).toEqual(['app.ts', 'util.ts']);
        expect(graph['app.ts']).toEqual(['util.ts']);
      }
    );
  });

  it('resolves tsconfig path aliases with extends', async () => {
    await withFixture(
      {
        'src/app/main.ts': `import {util} from '@app/utils';\nimport helper from '@shared/helper';\nconsole.log(util, helper);`,
        'src/app/utils.ts': `export const util = 1;`,
        'src/shared/helper.ts': `export default 2;`,
        'tsconfig.base.json': JSON.stringify({
          compilerOptions: {
            baseUrl: '.',
            paths: {
              '@shared/*': ['src/shared/*'],
            },
          },
        }),
        'tsconfig.json': JSON.stringify({
          extends: './tsconfig.base.json',
          compilerOptions: {
            paths: {
              '@app/*': ['src/app/*'],
            },
          },
        }),
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'src/app/main.ts'), {
          baseDir: root,
          tsConfig: 'tsconfig.json',
        });
        const graph = result.obj();

        expect(graph['src/app/main.ts'].sort()).toEqual(['src/app/utils.ts', 'src/shared/helper.ts']);
      }
    );
  });

  it('skips type imports when configured', async () => {
    await withFixture(
      {
        'main.ts': `import type {Type} from './types';\nimport {value} from './values';\nconsole.log(value);`,
        'types.ts': `export type Type = string;`,
        'values.ts': `export const value = 'hello';`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'main.ts'), {
          baseDir: root,
          detectiveOptions: { ts: { skipTypeImports: true } },
        });
        const files = result.getFiles();
        const graph = result.obj();

        expect(files.sort()).toEqual(['main.ts', 'values.ts']);
        expect(graph['main.ts']).toEqual(['values.ts']);
      }
    );
  });

  it('resolves directory imports to index files', async () => {
    await withFixture(
      {
        'app.ts': `import comp from './components';\nconsole.log(comp);`,
        'components/index.ts': `export default 'Component';`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'app.ts'), { baseDir: root });
        const files = result.getFiles();
        const graph = result.obj();

        expect(files.sort()).toEqual(['app.ts', 'components/index.ts']);
        expect(graph['app.ts']).toEqual(['components/index.ts']);
      }
    );
  });

  it('handles circular dependencies', async () => {
    await withFixture(
      {
        'a.ts': `import {b} from './b';\nexport const a = 1 + b;`,
        'b.ts': `import {a} from './a';\nexport const b = 2 + a;`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'a.ts'), { baseDir: root });
        const files = result.getFiles();
        const graph = result.obj();

        expect(files.sort()).toEqual(['a.ts', 'b.ts']);
        expect(graph['a.ts']).toEqual(['b.ts']);
        expect(graph['b.ts']).toEqual(['a.ts']);
      }
    );
  });

  it('applies excludeRegExp filter', async () => {
    await withFixture(
      {
        'main.ts': `import {util} from './utils';\nimport {test} from './tests/test.spec';\nconsole.log(util, test);`,
        'utils.ts': `export const util = 42;`,
        'tests/test.spec.ts': `export const test = 'test';`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'main.ts'), {
          baseDir: root,
          excludeRegExp: [/\.spec\.ts$/],
        });
        const files = result.getFiles();
        const graph = result.obj();

        expect(files.sort()).toEqual(['main.ts', 'utils.ts']);
        expect(graph['main.ts']).toEqual(['utils.ts']);
      }
    );
  });

  it('scans entire directory when provided', async () => {
    await withFixture(
      {
        'src/a.ts': `import {b} from './b';\nconsole.log(b);`,
        'src/b.ts': `export const b = 42;`,
        'src/c.ts': `export const c = 'hello';`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'src'), { baseDir: root });
        const files = result.getFiles();

        expect(files.sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
      }
    );
  });

  it('supports multiple file extensions', async () => {
    await withFixture(
      {
        'app.jsx': `import comp from './component';\nexport default comp;`,
        'component.tsx': `export default () => <div>Hello</div>;`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'app.jsx'), {
          baseDir: root,
          fileExtensions: ['jsx', 'tsx'],
        });
        const files = result.getFiles();

        expect(files.sort()).toEqual(['app.jsx', 'component.tsx']);
      }
    );
  });

  it('handles CommonJS require() syntax', async () => {
    await withFixture(
      {
        'main.js': `const util = require('./util');\nconsole.log(util);`,
        'util.js': `module.exports = 42;`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'main.js'), {
          baseDir: root,
          fileExtensions: ['js'],
        });
        const files = result.getFiles();
        const graph = result.obj();

        expect(files.sort()).toEqual(['main.js', 'util.js']);
        expect(graph['main.js']).toEqual(['util.js']);
      }
    );
  });

  it('handles dynamic imports', async () => {
    await withFixture(
      {
        'main.ts': `const mod = await import('./module');\nconsole.log(mod);`,
        'module.ts': `export default 'module';`,
      },
      async (root) => {
        const result = await depseeker(path.join(root, 'main.ts'), { baseDir: root });
        const files = result.getFiles();
        const graph = result.obj();

        expect(files.sort()).toEqual(['main.ts', 'module.ts']);
        expect(graph['main.ts']).toEqual(['module.ts']);
      }
    );
  });

  it('emits progress events', async () => {
    await withFixture(
      {
        'index.ts': `import './alpha';`,
        'alpha.ts': `import './beta';`,
        'beta.ts': `export const beta = 1;`,
      },
      async (root) => {
        const events: ProgressEvent[] = [];
        await depseeker(path.join(root, 'index.ts'), {
          baseDir: root,
          onProgress: (event) => {
            events.push(event);
          },
        });

        const fileStarts = events.filter((event) => event.type === 'file:start');
        const fileEnds = events.filter((event) => event.type === 'file:end');
        const dependencyEvents = events.filter((event) => event.type === 'file:dependencies');

        expect(fileStarts.length).toBeGreaterThanOrEqual(3);
        expect(fileEnds.length).toBeGreaterThanOrEqual(3);
        expect(dependencyEvents.length).toBeGreaterThanOrEqual(3);
      }
    );
  });
});
