#!/usr/bin/env node
/**
 * Standalone script to test manifest signature verification in isolation.
 * Run from packages/backend: node scripts/verify-signature-standalone.js [path-to-manifest.json]
 *
 * Without args: uses the hardcoded manifest below (with your signature).
 * With a path: loads that manifest and runs the same verification.
 *
 * Enable debug logs: VERIFY_DEBUG=1 node scripts/verify-signature-standalone.js [path]
 */

process.env.VERIFY_DEBUG = '1';

const fs = require('fs');
const path = require('path');

// Resolve backend lib from script location
const backendRoot = path.resolve(__dirname, '..');
const verifyPath = path.join(backendRoot, 'src', 'lib', 'verify.js');
const { verifyManifest } = require(verifyPath);

// Your exact signature (from the bundle that fails)
const SAMPLE_SIGNATURE = {
  algorithm: 'ed25519',
  publicKey: 'I0-kEyTMUZI-YjW_DnC90iefjWGqbpnJlr4djOZ0IBE',
  signature:
    '3L4eyOK2UAMpewg51g4uVBpFz42ZyFMt6vsiZDUvBuis_DEGPMp_uRareaaL7M0azNvlM8i_oKVVThLl7tUFDQ',
};

// Minimal manifest for isolated test. If the signature was produced over a different
// manifest (e.g. from mero-sign), pass that manifest file as the first argument.
const MINIMAL_MANIFEST = {
  package: 'test-package',
  version: '1.0.0',
  signature: SAMPLE_SIGNATURE,
};

async function main() {
  const manifestPath = process.argv[2];
  let manifest;

  if (manifestPath) {
    const fullPath = path.isAbsolute(manifestPath)
      ? manifestPath
      : path.resolve(process.cwd(), manifestPath);
    console.log('Loading manifest from', fullPath);
    const raw = fs.readFileSync(fullPath, 'utf8');
    manifest = JSON.parse(raw);
  } else {
    console.log('Using built-in minimal manifest with your signature.');
    manifest = JSON.parse(JSON.stringify(MINIMAL_MANIFEST));
  }

  try {
    await verifyManifest(manifest);
    console.log('\nResult: verification PASSED');
    process.exit(0);
  } catch (err) {
    console.error('\nError:', err.message);
    if (process.env.VERIFY_DEBUG) console.error(err.stack);
    console.error(
      '\nTip: If the signature was produced over a different manifest (e.g. by mero-sign),'
    );
    console.error(
      '     run with that manifest file to see the payload hash we verify against:'
    );
    console.error(
      '     node scripts/verify-signature-standalone.js path/to/manifest.json'
    );
    process.exit(1);
  }
}

main();
