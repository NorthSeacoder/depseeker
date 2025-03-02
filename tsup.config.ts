import { defineConfig } from 'tsup'

export default defineConfig({
  // entryPoints: ['src/index.ts','test.ts'],
  entryPoints: ['src/index.ts'],
  format: ['esm','cjs'],
  dts: true,
  outDir: 'dist',
  clean: true,
  minify: true,
  treeshake: true,
  cjsInterop: true,
  noExternal:['@babel/parser','@babel/traverse','tsconfig-paths'],
  // metafile: true,
})
