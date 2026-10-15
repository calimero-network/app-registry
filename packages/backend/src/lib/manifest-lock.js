const { isDeepStrictEqual } = require('util');
const { minRuntimeVersionOf } = require('./bundle-sanitize');

// Fields a node reads from the signed manifest in the stored bundle; the listing must not diverge from them.
const LOCKED_FIELDS = [
  'version',
  'minRuntimeVersion',
  'signerId',
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
      ? minRuntimeVersionOf(manifest)
      : manifest[field];
  return LOCKED_FIELDS.filter(
    field => !isDeepStrictEqual(value(body, field), value(existing, field))
  );
}

module.exports = { LOCKED_FIELDS, lockedFieldChanges };
