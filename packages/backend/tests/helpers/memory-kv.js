/**
 * An in-memory stand-in for both kv clients (api/lib and packages/backend),
 * covering every command the publish, read, audit and visibility paths use.
 * Values are strings, as Redis returns them.
 */

function createMemoryKv() {
  const store = new Map();
  const sets = new Map();
  const hashes = new Map();
  const lists = new Map();
  const setFor = k => {
    if (!sets.has(k)) sets.set(k, new Set());
    return sets.get(k);
  };

  const kv = {
    store,
    sets,
    hashes,
    lists,
    clear() {
      store.clear();
      sets.clear();
      hashes.clear();
      lists.clear();
    },
    get: async k => (store.has(k) ? store.get(k) : null),
    mGet: async keys => keys.map(k => (store.has(k) ? store.get(k) : null)),
    set: async (k, v) => (store.set(k, String(v)), 'OK'),
    setNX: async (k, v) => {
      if (store.has(k)) return false;
      store.set(k, String(v));
      return true;
    },
    setNXEx: async (k, v) => {
      if (store.has(k)) return false;
      store.set(k, String(v));
      return true;
    },
    setXX: async (k, v) => {
      if (!store.has(k)) return false;
      store.set(k, String(v));
      return true;
    },
    del: async k => {
      const had = store.delete(k) || sets.delete(k) || hashes.delete(k);
      lists.delete(k);
      return had ? 1 : 0;
    },
    incr: async k => {
      const next = (parseInt(store.get(k) ?? '0', 10) || 0) + 1;
      store.set(k, String(next));
      return next;
    },
    sAdd: async (k, ...m) => {
      const s = setFor(k);
      let added = 0;
      m.flat().forEach(x => {
        if (!s.has(String(x))) added++;
        s.add(String(x));
      });
      return added;
    },
    sMembers: async k => (sets.has(k) ? [...sets.get(k)] : []),
    sIsMember: async (k, m) =>
      sets.has(k) ? sets.get(k).has(String(m)) : false,
    sRem: async (k, ...m) => {
      if (!sets.has(k)) return 0;
      let removed = 0;
      m.flat().forEach(x => {
        if (sets.get(k).delete(String(x))) removed++;
      });
      return removed;
    },
    hSet: async (k, obj) => {
      if (!hashes.has(k)) hashes.set(k, {});
      Object.assign(hashes.get(k), obj);
      return Object.keys(obj).length;
    },
    hGet: async (k, f) => hashes.get(k)?.[f] ?? null,
    hGetAll: async k => ({ ...(hashes.get(k) || {}) }),
    hDel: async (k, ...f) => {
      const h = hashes.get(k);
      if (!h) return 0;
      let n = 0;
      f.flat().forEach(x => {
        if (x in h) {
          delete h[x];
          n++;
        }
      });
      return n;
    },
    rPush: async (k, ...v) => {
      if (!lists.has(k)) lists.set(k, []);
      lists.get(k).push(...v.flat().map(String));
      return lists.get(k).length;
    },
    lRange: async (k, start, stop) => {
      const list = lists.get(k) || [];
      const len = list.length;
      const from = start < 0 ? Math.max(len + start, 0) : start;
      const to = stop < 0 ? len + stop : Math.min(stop, len - 1);
      return to < from ? [] : list.slice(from, to + 1);
    },
    lLen: async k => (lists.get(k) || []).length,
    scanKeys: async pattern => {
      const prefix = pattern.replace(/\*$/, '');
      return [...store.keys(), ...sets.keys()].filter(k =>
        k.startsWith(prefix)
      );
    },
  };
  return kv;
}

module.exports = { createMemoryKv };
