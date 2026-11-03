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

// Readers disagree on which spelling wins, so every spelling the body carries must equal the stored floor.
const RUNTIME_FLOOR_SPELLINGS = ['minRuntimeVersion', 'min_runtime_version'];

function lockedFieldChanges(body, existing) {
  const floor = minRuntimeVersionOf(existing);
  return LOCKED_FIELDS.filter(field =>
    // Versions pushed before signerId was required have none stored, yet every
    // edit now has to carry one to verify. Let such a version gain it: the
    // verifier already pins it to the signing key, and the handler requires
    // that key to be an owner. Once stored, it is locked like the rest.
    field === 'signerId' && existing.signerId === undefined
      ? false
      : field === 'minRuntimeVersion'
        ? minRuntimeVersionOf(body) !== floor ||
          RUNTIME_FLOOR_SPELLINGS.some(
            key =>
              body[key] !== undefined &&
              minRuntimeVersionOf({ [key]: body[key] }) !== floor
          )
        : !isDeepStrictEqual(body[field], existing[field])
  );
}

module.exports = { LOCKED_FIELDS, lockedFieldChanges };
