/**
 * Each icon is stored once, and every read returns the manifest exactly as it
 * was published (the signature covers `metadata.icon`).
 */

const {
  withIconDedup,
  ICON_PREFIX,
  _clearCache,
} = require('../src/lib/icon-dedup');

function rawClient() {
  const store = new Map();
  return {
    store,
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async set(k, v) {
      store.set(k, v);
      return 'OK';
    },
    async setNX(k, v) {
      if (store.has(k)) return false;
      store.set(k, v);
      return true;
    },
    async setXX(k, v) {
      if (!store.has(k)) return false;
      store.set(k, v);
      return true;
    },
    async mGet(keys) {
      return keys.map(k => (store.has(k) ? store.get(k) : null));
    },
    async sAdd() {
      return 1;
    },
  };
}

const ICON = `data:image/png;base64,${'A'.repeat(10000)}`;

function manifest(version, icon = ICON) {
  return JSON.stringify({
    json: {
      package: 'com.example.app',
      appVersion: version,
      metadata: { name: 'App', icon, description: 'd' },
      signature: { sig: 'x' },
    },
    created_at: '2026-11-06T00:00:00.000Z',
  });
}

beforeEach(() => _clearCache());

test('a manifest reads back byte-identical, with the icon stored once', async () => {
  const raw = rawClient();
  const kv = withIconDedup(raw);
  for (const v of ['1.0.0', '1.0.1', '1.0.2']) {
    await kv.setNX(`bundle:com.example.app/${v}`, manifest(v));
  }
  const iconKeys = [...raw.store.keys()].filter(k => k.startsWith(ICON_PREFIX));
  expect(iconKeys).toHaveLength(1);
  expect(raw.store.get(iconKeys[0])).toBe(ICON);
  for (const v of ['1.0.0', '1.0.1', '1.0.2']) {
    const stored = raw.store.get(`bundle:com.example.app/${v}`);
    expect(stored.length).toBeLessThan(500);
    expect(stored).not.toContain('AAAA');
    expect(await kv.get(`bundle:com.example.app/${v}`)).toBe(manifest(v));
  }
});

test('mGet hydrates bundle keys and leaves others alone', async () => {
  const raw = rawClient();
  const kv = withIconDedup(raw);
  await kv.set('bundle:com.example.app/1.0.0', manifest('1.0.0'));
  await kv.set('downloads:com.example.app', '7');
  _clearCache(); // a cold process
  expect(
    await kv.mGet([
      'bundle:com.example.app/1.0.0',
      'downloads:com.example.app',
      'bundle:com.example.app/9.9.9',
    ])
  ).toEqual([manifest('1.0.0'), '7', null]);
});

test('old inline values and icon-less manifests pass through', async () => {
  const raw = rawClient();
  raw.store.set('bundle:com.example.app/0.1.0', manifest('0.1.0'));
  const kv = withIconDedup(raw);
  expect(await kv.get('bundle:com.example.app/0.1.0')).toBe(manifest('0.1.0'));

  const noIcon = manifest('0.2.0', null);
  await kv.set('bundle:com.example.app/0.2.0', noIcon);
  expect(raw.store.get('bundle:com.example.app/0.2.0')).toBe(noIcon);
  expect(await kv.get('bundle:com.example.app/0.2.0')).toBe(noIcon);
});

test('a read-modify-write (admin stamp) keeps the reference', async () => {
  const raw = rawClient();
  const kv = withIconDedup(raw);
  await kv.set('bundle:com.example.app/1.0.0', manifest('1.0.0'));
  const stored = JSON.parse(await kv.get('bundle:com.example.app/1.0.0'));
  stored.json.metadata._adminVerified = true;
  await kv.set('bundle:com.example.app/1.0.0', JSON.stringify(stored));
  expect(raw.store.get('bundle:com.example.app/1.0.0')).not.toContain('AAAA');
  const back = JSON.parse(await kv.get('bundle:com.example.app/1.0.0'));
  expect(back.json.metadata.icon).toBe(ICON);
  expect(back.json.metadata._adminVerified).toBe(true);
  expect(back.iconRef).toBeUndefined();
});

test('setXX does not create a deleted version', async () => {
  const raw = rawClient();
  const kv = withIconDedup(raw);
  expect(
    await kv.setXX('bundle:com.example.app/1.0.0', manifest('1.0.0'))
  ).toBe(false);
  expect(raw.store.has('bundle:com.example.app/1.0.0')).toBe(false);
});
