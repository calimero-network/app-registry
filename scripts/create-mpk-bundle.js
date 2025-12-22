#!/usr/bin/env node
/**
 * Create MPK bundle from WASM file and bundle manifest
 *
 * ⚠️  DEPRECATED: Use the CLI command instead:
 *   calimero-registry bundle create <wasm-file> <package> <version> [options]
 *
 * This script is kept for backward compatibility but the CLI is preferred.
 *
 * Usage: node scripts/create-mpk-bundle.js <wasm-file> <package> <version> [output-file]
 *
 * Example:
 *   node scripts/create-mpk-bundle.js artifacts/kv_store.wasm com.calimero.test-app 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { createGzip } = require('zlib');
const tar = require('tar');

async function createMPKBundle(
  wasmPath,
  package,
  version,
  metadata = {},
  outputPath = null
) {
  // Read WASM file
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM file not found: ${wasmPath}`);
  }

  const wasmContent = fs.readFileSync(wasmPath);
  const wasmSize = wasmContent.length;

  // Calculate SHA256 hash
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(wasmContent).digest('hex');

  // Create bundle manifest
  const manifest = {
    version: '1.0',
    package: package,
    appVersion: version,
    metadata: {
      name: metadata.name || package,
      description: metadata.description || '',
      author: metadata.author || 'Calimero Team',
      ...metadata,
    },
    interfaces: {
      exports: metadata.exports || [],
      uses: metadata.uses || [],
    },
    wasm: {
      path: 'app.wasm',
      hash: hash,
      size: wasmSize,
    },
    abi: null,
    migrations: [],
    links: metadata.links || null,
    signature: metadata.signature || null,
  };

  // Determine output path
  if (!outputPath) {
    const outputDir = path.join(
      __dirname,
      '../packages/backend/artifacts',
      package,
      version
    );
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    outputPath = path.join(outputDir, `${package}-${version}.mpk`);
  }

  // Create temporary directory for bundle contents
  const tempDir = path.join(__dirname, `../.temp-bundle-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    // Write manifest.json
    fs.writeFileSync(
      path.join(tempDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2)
    );

    // Copy WASM file as app.wasm
    fs.writeFileSync(path.join(tempDir, 'app.wasm'), wasmContent);

    // Create gzip-compressed tar archive
    await tar.create(
      {
        gzip: true,
        file: outputPath,
        cwd: tempDir,
      },
      ['manifest.json', 'app.wasm']
    );

    console.log(`✅ Created MPK bundle: ${outputPath}`);
    console.log(`   Package: ${package}`);
    console.log(`   Version: ${version}`);
    console.log(`   Size: ${fs.statSync(outputPath).size} bytes`);
    console.log(`   WASM Hash: ${hash}`);

    return outputPath;
  } finally {
    // Cleanup temp directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error(
      'Usage: node scripts/create-mpk-bundle.js <wasm-file> <package> <version> [output-file]'
    );
    console.error('');
    console.error('Example:');
    console.error(
      '  node scripts/create-mpk-bundle.js artifacts/kv_store.wasm com.calimero.test-app 1.0.0'
    );
    process.exit(1);
  }

  const [wasmPath, package, version, outputPath] = args;

  createMPKBundle(wasmPath, package, version, {}, outputPath)
    .then(() => {
      console.log('✅ Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Error:', error.message);
      process.exit(1);
    });
}

module.exports = { createMPKBundle };
