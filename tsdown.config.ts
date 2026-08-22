import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['./src/index.ts'],
  format: 'esm',
  platform: 'node',
  sourcemap: true,
  clean: true,
  fixedExtension: true,
});
