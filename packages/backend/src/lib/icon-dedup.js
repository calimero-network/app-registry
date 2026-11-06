/**
 * One copy of each app icon in Redis, however many versions carry it.
 *
 * cargo-mero inlines the icon into `metadata.icon` as a data URI, and the
 * manifest is signed with it, so every published version stored its own copy:
 * about 10 KB of a typical 14 KB manifest, and the same bytes in every version
 * of a package. On the 30 MB Redis that was most of the space.
 *
 * Now a `bundle:<pkg>/<version>` value is written with the icon swapped for
 * `bundle-icon:<sha256>` and the data URI stored once under that key. Every
 * read puts it back, so callers (and the signature over the manifest) see
 * exactly what was published. This sits in the one Redis client, so every
 * route that reads or writes a `bundle:` key directly gets it too.
 *
 * Old values (icon still inline) read as before; scripts/dedupe-bundle-icons.js
 * rewrites them. Icon keys are content-addressed and shared, so deleting a
 * version leaves its icon; that is one small key per distinct icon.
 */

const crypto = require('crypto');

const BUNDLE_KEY = /^bundle:[^/]+\/.+/;
const ICON_PREFIX = 'bundle-icon:';
// The stored value's marker: names the icon it holds a reference to.
const REF_FIELD = 'iconRef';

// Icons are immutable (content-addressed), so a process can keep them.
const CACHE_MAX = 500;
const cache = new Map();

function remember(hash, icon) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(hash, icon);
}

function parse(value) {
  if (typeof value !== 'string') return null;
  try {
    const stored = JSON.parse(value);
    return stored && typeof stored === 'object' && stored.json ? stored : null;
  } catch {
    return null;
  }
}

/**
 * The value to store for `value`, and the icon to store beside it (or null).
 */
function dehydrate(value) {
  const stored = parse(value);
  const icon = stored?.json?.metadata?.icon;
  if (typeof icon !== 'string' || !icon.startsWith('data:')) {
    return { value, icon: null };
  }
  const hash = crypto.createHash('sha256').update(icon).digest('hex');
  const metadata = { ...stored.json.metadata, icon: ICON_PREFIX + hash };
  const out = { ...stored, json: { ...stored.json, metadata } };
  out[REF_FIELD] = hash;
  return { value: JSON.stringify(out), icon: { hash, data: icon } };
}

function refOf(value) {
  const stored = parse(value);
  const hash = stored?.[REF_FIELD];
  return typeof hash === 'string' &&
    stored.json?.metadata?.icon === ICON_PREFIX + hash
    ? { stored, hash }
    : null;
}

function hydrate(ref, icon) {
  const { stored } = ref;
  const metadata = { ...stored.json.metadata };
  if (typeof icon === 'string') metadata.icon = icon;
  else delete metadata.icon; // its key is gone; better no icon than a bogus one
  const out = { ...stored, json: { ...stored.json, metadata } };
  delete out[REF_FIELD];
  return JSON.stringify(out);
}

function withIconDedup(client) {
  const base = client;
  const wrapped = Object.create(client);

  async function loadIcons(self, hashes) {
    const missing = [...new Set(hashes)].filter(h => !cache.has(h));
    if (missing.length) {
      const keys = missing.map(h => ICON_PREFIX + h);
      const got =
        typeof base.mGet === 'function'
          ? await base.mGet.call(self, keys)
          : await Promise.all(keys.map(k => base.get.call(self, k)));
      missing.forEach((h, i) => {
        if (typeof got[i] === 'string') remember(h, got[i]);
      });
    }
    return hashes.map(h => cache.get(h));
  }

  async function storeIcon(self, icon) {
    if (!icon || cache.has(icon.hash)) return;
    await base.setNX.call(self, ICON_PREFIX + icon.hash, icon.data);
    remember(icon.hash, icon.data);
  }

  // The icon is written before the manifest that points at it, so a reader
  // never finds a reference whose icon is missing.
  for (const op of ['set', 'setNX', 'setXX']) {
    wrapped[op] = async function (key, value, ...rest) {
      if (!BUNDLE_KEY.test(key))
        return base[op].call(this, key, value, ...rest);
      const { value: out, icon } = dehydrate(value);
      await storeIcon(this, icon);
      return base[op].call(this, key, out, ...rest);
    };
  }

  wrapped.get = async function (key) {
    const value = await base.get.call(this, key);
    if (!BUNDLE_KEY.test(key)) return value;
    const ref = refOf(value);
    if (!ref) return value;
    const [icon] = await loadIcons(this, [ref.hash]);
    return hydrate(ref, icon);
  };

  if (typeof base.mGet === 'function') {
    wrapped.mGet = async function (keys) {
      const values = await base.mGet.call(this, keys);
      const refs = values.map((v, i) =>
        BUNDLE_KEY.test(keys[i]) ? refOf(v) : null
      );
      const hashes = refs.filter(Boolean).map(r => r.hash);
      if (!hashes.length) return values;
      const icons = await loadIcons(this, hashes);
      let n = 0;
      return values.map((v, i) => (refs[i] ? hydrate(refs[i], icons[n++]) : v));
    };
  }

  return wrapped;
}

module.exports = {
  withIconDedup,
  ICON_PREFIX,
  // for tests
  _clearCache: () => cache.clear(),
};
