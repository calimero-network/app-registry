import { defineConfig } from 'tsup';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['commander', 'chalk', 'ora', 'table', 'tar'],
  banner: {
    js: '#!/usr/bin/env node',
  },
  esbuildOptions(options) {
    // Resolve workspace package to source files for bundling
    options.alias = {
      '@calimero-network/registry-client': path.resolve(
        __dirname,
        '../client-library/src/index.ts'
      ),
    };
  },
});
