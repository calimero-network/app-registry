const { isDeepStrictEqual } = require('util');

// Fields a node reads from the signed manifest in the stored bundle; the listing must not diverge from them.
const LOCKED_FIELDS = [
  'version',
  'minRuntimeVersion',
  'handlers',
  'buildInfo',
  'interfaces',
  'abi',
  'services',
];

function lockedFieldChanges(body, existing) {
  // GET fills in the default, so a GET-edit-sign round trip carries it.
  const value = (manifest, field) =>
    field === 'minRuntimeVersion'
      ? (manifest.minRuntimeVersion ?? '0.1.0')
      : manifest[field];
  return LOCKED_FIELDS.filter(
    field => !isDeepStrictEqual(value(body, field), value(existing, field))
  );
}

module.exports = { LOCKED_FIELDS, lockedFieldChanges };
