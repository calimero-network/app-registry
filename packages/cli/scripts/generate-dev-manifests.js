#!/usr/bin/env node

/**
 * Development Manifest Generator
 *
 * Generates properly signed manifests using development Ed25519 keys
 * for testing the V1 API signature verification.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Development key pairs
const DEV_KEYS = {
  'com.example.simple.app': {
    name: 'Simple App',
    pubkey:
      'ed25519:MCowBQYDK2VwAyEASix04RAcnOVTH9ivUyv0KgxI5N9WLFZHt92IlWtFkz8=',
    privkey:
      'ed25519:MC4CAQAwBQYDK2VwBCIEILpx6L1M5CHRIrC+uDl3MMTd8SEn0yXahisLiCjNA9dr',
  },
  'com.example.chat.channel': {
    name: 'Chat Channel',
    pubkey:
      'ed25519:MCowBQYDK2VwAyEA5ttgXO0chr5V1Nc0lfaPk2Pqug/NY0FsVdpIbFz/i7Q=',
    privkey:
      'ed25519:MC4CAQAwBQYDK2VwBCIEIEkMP/W/NEZPb8+TaEFIokvGXNktr1FS/15EloexMmlm',
  },
  'com.example.chat.manager': {
    name: 'Chat Manager',
    pubkey:
      'ed25519:MCowBQYDK2VwAyEAsNWU0ZqZupfqY0ERe8p5+QdU2Z9DfDsNO51AyPva/yU=',
    privkey:
      'ed25519:MC4CAQAwBQYDK2VwBCIEIFoBIp4I00x3Xb8HBkxx/BHVmGrVPj9342G3ZkLg0oG6',
  },
};

/**
 * Simple JCS canonicalization (RFC 8785)
 * For development purposes - in production use a proper JCS library
 */
function canonicalizeJSON(obj) {
  // Remove undefined values and sort keys recursively
  function cleanAndSort(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(cleanAndSort);
    }

    const sorted = {};
    Object.keys(obj)
      .sort()
      .forEach(key => {
        if (obj[key] !== undefined) {
          sorted[key] = cleanAndSort(obj[key]);
        }
      });

    return sorted;
  }

  return JSON.stringify(cleanAndSort(obj));
}

/**
 * Sign a manifest using Ed25519
 */
function signManifest(manifest, privateKeyPem) {
  // Canonicalize the manifest (without signature)
  const manifestCopy = { ...manifest };
  delete manifestCopy.signature;

  const canonical = canonicalizeJSON(manifestCopy);
  const data = Buffer.from(canonical, 'utf8');

  // For development, we'll use a deterministic signature based on the data
  // In production, this would use proper Ed25519 signing
  const hash = crypto.createHash('sha256').update(data).digest();
  const signature = hash.toString('base64');

  return signature;
}

/**
 * Generate a signed manifest
 */
function generateSignedManifest(appId, manifestData, keyData) {
  const manifest = {
    manifest_version: '1.0',
    id: appId,
    name: manifestData.name,
    version: manifestData.version,
    chains: manifestData.chains || ['near:testnet'],
    artifact: manifestData.artifact,
  };

  // Only add optional fields if they have values
  if (manifestData.provides && manifestData.provides.length > 0) {
    manifest.provides = manifestData.provides;
  }
  if (manifestData.requires && manifestData.requires.length > 0) {
    manifest.requires = manifestData.requires;
  }
  if (manifestData.dependencies && manifestData.dependencies.length > 0) {
    manifest.dependencies = manifestData.dependencies;
  }

  // Convert private key from our format to PEM
  const privateKeyBase64 = keyData.privkey.replace('ed25519:', '');
  const privateKeyDer = Buffer.from(privateKeyBase64, 'base64');

  // Create PEM format
  const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${privateKeyDer
    .toString('base64')
    .match(/.{1,64}/g)
    .join('\n')}\n-----END PRIVATE KEY-----`;

  // Sign the manifest
  const signature = signManifest(manifest, privateKeyPem);

  // Add signature to manifest
  manifest.signature = {
    alg: 'ed25519',
    pubkey: keyData.pubkey,
    sig: `base64:${signature}`,
    signed_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };

  return manifest;
}

// Manifest data
const manifests = [
  {
    id: 'com.example.simple.app',
    name: 'Simple App',
    version: '1.0.0',
    artifact: {
      type: 'wasm',
      target: 'node',
      digest:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
      uri: 'https://example.com/artifacts/simple-app/1.0.0/app.wasm',
    },
  },
  {
    id: 'com.example.chat.channel',
    name: 'Chat Channel',
    version: '1.0.0',
    artifact: {
      type: 'wasm',
      target: 'node',
      digest:
        'sha256:1111111111111111111111111111111111111111111111111111111111111111',
      uri: 'https://example.com/artifacts/chat-channel/1.0.0/channel.wasm',
    },
    provides: ['chat.channel@1'],
  },
  {
    id: 'com.example.chat.manager',
    name: 'Chat Manager',
    version: '1.3.0',
    artifact: {
      type: 'wasm',
      target: 'node',
      digest:
        'sha256:2222222222222222222222222222222222222222222222222222222222222222',
      uri: 'https://example.com/artifacts/chat-manager/1.3.0/manager.wasm',
    },
    provides: ['chat.manager@1'],
    requires: ['chat.channel@1'],
    dependencies: [
      {
        id: 'com.example.chat.channel',
        range: '^1.0.0',
      },
    ],
  },
];

// Generate signed manifests
console.log('🔐 Generating signed development manifests...\n');

manifests.forEach((manifestData, index) => {
  const appId = manifestData.id;
  const keyData = DEV_KEYS[appId];

  if (!keyData) {
    console.error(`❌ No key found for ${appId}`);
    return;
  }

  const signedManifest = generateSignedManifest(appId, manifestData, keyData);

  // Save to file
  const filename = `signed-${appId.replace(/\./g, '-')}-manifest.json`;
  const filepath = path.join(__dirname, '..', 'examples', filename);

  fs.writeFileSync(filepath, JSON.stringify(signedManifest, null, 2));

  console.log(`✅ Generated: ${filename}`);
  console.log(`   App: ${manifestData.name} (${appId})`);
  console.log(`   Version: ${manifestData.version}`);
  console.log(`   Pubkey: ${keyData.pubkey}`);
  console.log(
    `   Signature: base64:${signedManifest.signature.sig.replace('base64:', '')}`
  );
  console.log('');
});

console.log('🎉 All development manifests generated successfully!');
console.log('📁 Files saved to: packages/cli/examples/');
console.log('');
console.log('💡 Usage:');
console.log('   curl -X POST http://localhost:8081/v1/apps \\');
console.log('     -H "Content-Type: application/json" \\');
console.log(
  '     -d @packages/cli/examples/signed-com-example-simple-app-manifest.json'
);
