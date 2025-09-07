import { defineConfig } from 'tsup'
import { tsconfigPathsPlugin } from 'esbuild-plugin-tsconfig-paths'

// NOTE: Rely on tsup's built-in alias handling.
// A previous custom esbuild plugin forcibly resolved "@/" imports to absolute
// paths without extension resolution, which caused errors like
// "Cannot read file ... is a directory" when importing directories or files
// without specifying extensions. Removing it allows esbuild to perform its
// standard TypeScript resolution (including index.ts and .ts extensions).

export default defineConfig({
  entry: [
    'src/*.ts',
    'src/types/*.ts',
  ],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: [
    'esm',
    'cjs',
  ],
  // Try full DTS bundling
  dts: true,
  esbuildPlugins: [tsconfigPathsPlugin({ filter: /.*/ })],
})
