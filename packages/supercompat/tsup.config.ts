import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/*.ts',
    'src/types/*.ts',
    'src/openai/index.ts',
  ],
  splitting: false,
  sourcemap: true,
  clean: true,
  format: [
    'esm',
    'cjs',
  ],
  dts: true,
})
