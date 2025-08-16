import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['@ssapp-registry/client', 'commander', 'chalk', 'ora', 'table'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
