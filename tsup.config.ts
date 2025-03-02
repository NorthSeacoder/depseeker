import { defineConfig } from 'tsup'

export default defineConfig({
  entryPoints: ['src/index.ts', 'test.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  outDir: 'dist',
  clean: true,
  minify: true,
  treeshake: true,
  cjsInterop: true,
  // metafile: true,
})
