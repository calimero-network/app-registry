/**
 * Binds an uploaded `.mpk` to the signed manifest it is published under.
 *
 * The signature covers the manifest with `_`-prefixed keys stripped, so
 * `_binary` is never signed. On its own, a valid signature says nothing about
 * the bytes stored next to it. What does bind them is the manifest's own
 * artifact hashes: every wasm entry carries a sha256 of its bytes. This checks
 * that the archive holds that same manifest and that every artifact it names
 * hashes to what the signature covers.
 *
 * Mirrors the node's check (core: node/primitives/src/client/application/
 * bundle.rs, verify_artifact_digest), so a bundle this accepts is one a node
 * will also accept.
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { Parser } = require('tar');
const { canonicalizeJSON, removeTransientFields } = require('./verify');

// Same ceiling the node applies to a full bundle walk.
const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;

const normalizePath = p => String(p).replace(/^(\.\/)+/, '');

/** Regular files in a gzipped tar, by path. Links and directories are skipped. */
async function readEntries(buffer) {
  let tarBytes;
  try {
    tarBytes = zlib.gunzipSync(buffer, { maxOutputLength: MAX_UNPACKED_BYTES });
  } catch (err) {
    throw new Error(`Bundle is not a gzipped archive: ${err.message}`);
  }

  const files = new Map();
  await new Promise((resolve, reject) => {
    const parser = new Parser({
      strict: true,
      onReadEntry: entry => {
        if (entry.type !== 'File') {
          entry.resume();
          return;
        }
        const path = normalizePath(entry.path);
        const chunks = [];
        entry.on('data', chunk => chunks.push(chunk));
        entry.on('end', () => {
          if (files.has(path)) {
            reject(new Error(`Bundle contains ${path} more than once`));
            return;
          }
          files.set(path, Buffer.concat(chunks));
        });
      },
    });
    parser.on('error', reject);
    parser.on('end', resolve);
    parser.end(tarBytes);
  });
  return files;
}

const sha256Hex = bytes =>
  crypto.createHash('sha256').update(bytes).digest('hex');

/**
 * Throws unless `buffer` is a bundle whose manifest.json is `manifest` and
 * whose artifacts hash to the values `manifest` records.
 *
 * @param {Buffer} buffer the `.mpk` bytes
 * @param {Object} manifest the manifest whose signature was verified
 */
async function assertBinaryMatchesManifest(buffer, manifest) {
  const files = await readEntries(buffer);

  const inner = files.get('manifest.json');
  if (!inner) {
    throw new Error('Bundle does not contain manifest.json');
  }
  let innerManifest;
  try {
    innerManifest = JSON.parse(inner.toString('utf8'));
  } catch {
    throw new Error('Bundle manifest.json is not valid JSON');
  }
  const sameContent =
    canonicalizeJSON(removeTransientFields(innerManifest)) ===
    canonicalizeJSON(removeTransientFields(manifest));
  const sameSignature =
    innerManifest?.signature?.signature === manifest?.signature?.signature;
  if (!sameContent || !sameSignature) {
    throw new Error(
      'Bundle manifest.json does not match the manifest it was published with'
    );
  }

  // Wasm is what a node runs, so every wasm artifact must be present. An ABI
  // is optional in the archive (nodes read the embedded section), but one that
  // is shipped must still match its recorded hash.
  const required = [
    manifest.wasm,
    ...(manifest.services || []).map(s => s?.wasm),
  ].filter(Boolean);
  const optional = [
    manifest.abi,
    ...(manifest.services || []).map(s => s?.abi),
  ].filter(Boolean);
  if (required.length === 0) {
    throw new Error('Manifest names no wasm artifact');
  }

  const check = (artifact, mustExist) => {
    if (typeof artifact.hash !== 'string' || artifact.hash.length === 0) {
      throw new Error(`Artifact ${artifact.path} has no hash`);
    }
    const bytes = files.get(normalizePath(artifact.path));
    if (!bytes) {
      if (mustExist) throw new Error(`Bundle is missing ${artifact.path}`);
      return;
    }
    if (sha256Hex(bytes) !== artifact.hash.toLowerCase()) {
      throw new Error(
        `Bundle artifact ${artifact.path} does not match its manifest hash`
      );
    }
  };
  required.forEach(a => check(a, true));
  optional.forEach(a => check(a, false));
}

module.exports = { assertBinaryMatchesManifest };
