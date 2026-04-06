import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'src/*.ts',
    'src/types/*.ts',
    'src/openaiAssistants/index.ts',
    'src/openaiResponses/index.ts',
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
