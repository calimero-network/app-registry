/**
 * Bundle integrity — prove an uploaded .mpk is the bundle its manifest signed.
 *
 * The publisher's signature covers the manifest only (every `_`-prefixed key,
 * including `_binary`, is excluded from the signed payload). Without this
 * check, anyone can take a public, signed manifest, attach arbitrary bytes as
 * `_binary`, and the signature still verifies — a signed manifest can be
 * replayed to carry any archive.
 *
 * So the archive is opened and bound to the signature:
 *   1. It must contain `manifest.json`, that manifest must carry the SAME
 *      signature as the pushed one, and it must verify on its own. Ed25519
 *      signatures cannot be moved to a different message, so this proves the
 *      archive's manifest is the manifest the publisher signed.
 *   2. Every artifact that signed manifest references (wasm, abi, and each
 *      service's wasm/abi) must be in the archive with a matching sha256 and
 *      size.
 *   3. Nothing else may be in it: no unreferenced files, no duplicate paths,
 *      no links or devices. A file the manifest does not hash is a file an
 *      attacker could change.
 *
 * The artifact list comes from the archive's (verified) manifest, not from the
 * pushed one, because push handlers rewrite server-owned fields such as
 * `metadata.author` before storage and the pushed object is then no longer
 * byte-identical to what was signed.
 */

const crypto = require('crypto');
const { Parser } = require('tar');
const { verifyManifest, normalizeSignature } = require('./verify');

// Hard ceilings so a small gzip cannot expand into an unbounded buffer.
const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 1000;

class BundleIntegrityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BundleIntegrityError';
    this.code = 'bundle_integrity';
  }
}

/**
 * True if a bundle artifact path is NOT a safe, bundle-relative path: it is a
 * non-string, empty, absolute, or contains a `.`/`..`/empty segment. Mirrors
 * the CLI's assertSafeBundlePath (packages/cli/src/lib/services.ts); keep the
 * two in sync.
 */
function isUnsafeBundlePath(p) {
  if (typeof p !== 'string' || p.length === 0) return true;
  const segments = p.split(/[\\/]/);
  return (
    p.startsWith('/') ||
    /^[a-zA-Z]:/.test(p) ||
    segments.includes('..') ||
    segments.includes('.') ||
    segments.includes('')
  );
}

/** `./app.wasm` and `app.wasm` name the same archive member. */
function normalizeEntryPath(p) {
  return String(p).replace(/^(\.\/)+/, '');
}

/**
 * Read a gzip'd tar into memory as a Map<path, Buffer> of its regular files.
 * Rejects anything that is not a regular file or a directory, and duplicate
 * paths (extractors keep the LAST copy, so a duplicate could hide a swapped
 * file behind a correct one).
 */
function readArchive(buffer) {
  return new Promise((resolve, reject) => {
    const files = new Map();
    let total = 0;
    let entries = 0;
    let failed = false;
    const fail = err => {
      if (failed) return;
      failed = true;
      reject(
        err instanceof BundleIntegrityError
          ? err
          : new BundleIntegrityError(
              `Bundle is not a readable .mpk archive: ${err?.message ?? err}`
            )
      );
    };

    const parser = new Parser({ strict: true });
    parser.on('entry', entry => {
      if (failed) return entry.resume();
      entries += 1;
      if (entries > MAX_ENTRIES) {
        entry.resume();
        return fail(
          new BundleIntegrityError(
            `Bundle has more than ${MAX_ENTRIES} entries`
          )
        );
      }
      if (entry.type === 'Directory') {
        const dir = normalizeEntryPath(entry.path).replace(/[\\/]+$/, '');
        if (dir === '' || dir === '.') return entry.resume();
        if (isUnsafeBundlePath(dir)) {
          entry.resume();
          return fail(
            new BundleIntegrityError(
              `Bundle entry "${entry.path}" is not a safe relative path`
            )
          );
        }
        return entry.resume();
      }
      if (entry.type !== 'File' && entry.type !== 'OldFile') {
        entry.resume();
        return fail(
          new BundleIntegrityError(
            `Bundle entry "${entry.path}" is a ${entry.type}; only regular files are allowed`
          )
        );
      }
      const name = normalizeEntryPath(entry.path);
      if (isUnsafeBundlePath(name)) {
        entry.resume();
        return fail(
          new BundleIntegrityError(
            `Bundle entry "${entry.path}" is not a safe relative path`
          )
        );
      }
      if (files.has(name)) {
        entry.resume();
        return fail(
          new BundleIntegrityError(`Bundle contains "${name}" more than once`)
        );
      }
      const chunks = [];
      entry.on('data', chunk => {
        total += chunk.length;
        if (total > MAX_UNPACKED_BYTES) {
          return fail(
            new BundleIntegrityError('Bundle unpacks to more than 512 MiB')
          );
        }
        if (!failed) chunks.push(chunk);
      });
      entry.on('end', () => {
        if (!failed) files.set(name, Buffer.concat(chunks));
      });
    });
    parser.on('warn', (_code, message) => fail(new Error(message)));
    parser.on('error', fail);
    parser.on('end', () => {
      if (failed) return;
      if (entries === 0)
        return fail(new BundleIntegrityError('Bundle archive is empty'));
      resolve(files);
    });
    parser.end(buffer);
  });
}

/** Every file artifact a manifest references, as {label, path, hash, size}. */
function referencedArtifacts(manifest) {
  const refs = [];
  const add = (label, art) => {
    if (art === undefined || art === null) return;
    if (typeof art !== 'object' || typeof art.path !== 'string' || !art.path) {
      throw new BundleIntegrityError(`Manifest ${label} has no path`);
    }
    if (isUnsafeBundlePath(normalizeEntryPath(art.path))) {
      throw new BundleIntegrityError(
        `Manifest ${label} path "${art.path}" is not a safe relative path`
      );
    }
    if (typeof art.hash !== 'string' || !/^[0-9a-fA-F]{64}$/.test(art.hash)) {
      throw new BundleIntegrityError(
        `Manifest ${label} (${art.path}) must carry a sha256 hex hash`
      );
    }
    refs.push({
      label,
      path: normalizeEntryPath(art.path),
      hash: art.hash.toLowerCase(),
      size: art.size,
    });
  };
  add('wasm', manifest.wasm);
  add('abi', manifest.abi);
  if (Array.isArray(manifest.services)) {
    for (const svc of manifest.services) {
      add(`service "${svc?.name}" wasm`, svc?.wasm);
      add(`service "${svc?.name}" abi`, svc?.abi);
    }
  }
  return refs;
}

function sameSignature(a, b) {
  const x = normalizeSignature(a);
  const y = normalizeSignature(b);
  return (
    !!x && !!y && x.alg === y.alg && x.pubkey === y.pubkey && x.sig === y.sig
  );
}

/**
 * Throw BundleIntegrityError unless `buffer` (a .mpk) is exactly the bundle
 * `manifest` was signed for. Resolves with the archive's verified manifest.
 */
async function verifyBundleBinary(manifest, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new BundleIntegrityError('Bundle binary is empty');
  }
  const files = await readArchive(buffer);

  const rawInner = files.get('manifest.json');
  if (!rawInner) {
    throw new BundleIntegrityError('Bundle must contain manifest.json');
  }
  let inner;
  try {
    inner = JSON.parse(rawInner.toString('utf8'));
  } catch {
    throw new BundleIntegrityError('Bundle manifest.json is not valid JSON');
  }
  if (!sameSignature(inner.signature, manifest.signature)) {
    throw new BundleIntegrityError(
      'Bundle manifest.json is not signed with the signature that was pushed'
    );
  }
  try {
    await verifyManifest(inner);
  } catch (err) {
    // The verifier failing to run is a server fault (500), not a bad bundle.
    if (err?.code === 'verifier_unavailable') throw err;
    throw new BundleIntegrityError(
      `Bundle manifest.json signature does not verify: ${err.message}`
    );
  }
  if (
    inner.package !== manifest.package ||
    inner.appVersion !== manifest.appVersion
  ) {
    throw new BundleIntegrityError(
      'Bundle manifest.json names a different package or version'
    );
  }

  const refs = referencedArtifacts(inner);
  if (refs.length === 0) {
    throw new BundleIntegrityError(
      'Bundle manifest references no wasm artifact'
    );
  }
  const expected = new Set(['manifest.json']);
  for (const ref of refs) {
    expected.add(ref.path);
    const data = files.get(ref.path);
    if (!data) {
      throw new BundleIntegrityError(
        `Bundle is missing ${ref.label} (${ref.path})`
      );
    }
    const actual = crypto.createHash('sha256').update(data).digest('hex');
    if (actual !== ref.hash) {
      throw new BundleIntegrityError(
        `Bundle ${ref.label} (${ref.path}) does not match its signed sha256`
      );
    }
    if (
      ref.size !== undefined &&
      ref.size !== null &&
      Number(ref.size) !== data.length
    ) {
      throw new BundleIntegrityError(
        `Bundle ${ref.label} (${ref.path}) does not match its signed size`
      );
    }
  }
  for (const name of files.keys()) {
    if (!expected.has(name)) {
      throw new BundleIntegrityError(
        `Bundle contains "${name}", which the signed manifest does not reference`
      );
    }
  }
  return inner;
}

/**
 * Map a storeBundleManifest refusal to an HTTP answer, or null for a real
 * server error. A bundle that fails integrity is the client's fault (400); a
 * version that already exists is a conflict (409), not a 500.
 */
function storeRefusal(err) {
  if (err instanceof BundleIntegrityError) {
    return {
      status: 400,
      body: { error: 'bundle_integrity', message: err.message },
    };
  }
  if (/already exists\. First-come-first-serve/.test(err?.message ?? '')) {
    return {
      status: 409,
      body: { error: 'version_exists', message: err.message },
    };
  }
  return null;
}

module.exports = {
  verifyBundleBinary,
  BundleIntegrityError,
  storeRefusal,
  isUnsafeBundlePath,
  normalizeEntryPath,
};
