/**
 * No deployed file may require() an ESM-only package.
 *
 * Vercel runs these functions through its own module loader
 * (/opt/rust/nodejs.js), and that loader refuses require() of an ES module
 * with ERR_REQUIRE_ESM even on Node 24, where plain Node and Jest accept it.
 * So a require() of an ESM-only dependency passes every local and CI run and
 * fails only in production: that is how @noble/ed25519 turned every bundle
 * publish into "Invalid signature".
 *
 * This test resolves every bare require() in the code Vercel deploys (api/,
 * shared/, packages/backend/src/) and fails if it lands on an ES module.
 */
const fs = require('fs');
const path = require('path');
const { builtinModules, createRequire } = require('module');

const ROOT = path.resolve(__dirname, '../../..');
const DEPLOYED_DIRS = ['api', 'shared', 'packages/backend/src'];

// A require() of an ESM-only package is allowed only where the file falls
// back to import() on ERR_REQUIRE_ESM. Each entry is checked below.
const ALLOWED = {
  'packages/backend/src/lib/verify.js': ['@noble/ed25519'],
};

const BUILTINS = new Set(builtinModules);

function jsFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (/\.(c?js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function packageNameOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Whether Node treats the file at `resolved` as an ES module. */
function isEsm(resolved) {
  if (resolved.endsWith('.mjs')) return true;
  if (resolved.endsWith('.cjs') || resolved.endsWith('.json')) return false;
  let dir = path.dirname(resolved);
  for (;;) {
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      return JSON.parse(fs.readFileSync(pkg, 'utf8')).type === 'module';
    }
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

function esmRequires() {
  const found = [];
  for (const dir of DEPLOYED_DIRS) {
    for (const file of jsFiles(path.join(ROOT, dir))) {
      const source = fs.readFileSync(file, 'utf8');
      const req = createRequire(file);
      for (const m of source.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const specifier = m[1];
        if (
          specifier.startsWith('.') ||
          specifier.startsWith('#') ||
          specifier.startsWith('node:') ||
          BUILTINS.has(specifier)
        ) {
          continue;
        }
        let resolved;
        try {
          resolved = req.resolve(specifier);
        } catch {
          // Resolution itself failing is a different defect, reported
          // with its own message rather than hidden here.
          found.push({ file, specifier, unresolved: true });
          continue;
        }
        if (isEsm(resolved)) found.push({ file, specifier });
      }
    }
  }
  return found.map(f => ({ ...f, file: path.relative(ROOT, f.file) }));
}

describe('deployed code never require()s an ES module', () => {
  const found = esmRequires();

  test('every bare require() resolves', () => {
    expect(found.filter(f => f.unresolved)).toEqual([]);
  });

  test('no require() of an ESM-only package outside the allowlist', () => {
    const offending = found
      .filter(f => !f.unresolved)
      .filter(
        f => !(ALLOWED[f.file] || []).includes(packageNameOf(f.specifier))
      )
      .map(f => `${f.file}: require('${f.specifier}')`);
    expect(offending).toEqual([]);
  });

  test.each(Object.entries(ALLOWED))(
    '%s falls back to import() for its ESM requires',
    (file, packages) => {
      const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect(source).toContain('ERR_REQUIRE_ESM');
      for (const pkg of packages) {
        expect(source).toContain(`import('${pkg}')`);
      }
    }
  );

  test('the scan sees the known ESM-only dependency', () => {
    // Guards the scanner itself: if resolution or format detection broke,
    // every check above would pass on an empty list.
    expect(found).toContainEqual({
      file: 'packages/backend/src/lib/verify.js',
      specifier: '@noble/ed25519',
    });
  });
});
