import { defineConfig } from 'tsup';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node24',
  dts: false,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  // Mark Node.js built-ins and problematic CommonJS dependencies as external
  external: [
    'commander',
    'chalk',
    'ora',
    'table',
    'tar',
    // axios and its dependencies (used by client library)
    'axios',
    'form-data',
    'combined-stream',
    // Node.js built-ins (these are automatically external, but being explicit helps)
    'util',
    'fs',
    'path',
    'os',
    'crypto',
    'stream',
    'events',
    'http',
    'https',
    'url',
    'buffer',
    'process',
  ],
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
    // Ensure proper handling of CommonJS dependencies
    options.platform = 'node';
    options.target = 'node24';
    // Allow bundling of CommonJS dependencies
    options.bundle = true;
  },
});
