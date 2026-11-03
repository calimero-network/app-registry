/**
 * lockedFieldChanges: which node-read fields a PATCH body changes relative to
 * the stored version.
 */

const {
  LOCKED_FIELDS,
  lockedFieldChanges,
} = require('../src/lib/manifest-lock');

const stored = {
  version: '1.0',
  minRuntimeVersion: '0.5.0',
  signerId: 'did:key:z6MkStored',
  handlers: { onInit: 'init' },
  buildInfo: { rustc: '1.80.0', profile: 'release' },
  interfaces: ['calimero.kv'],
  abi: { methods: [{ name: 'get' }] },
  services: [{ name: 'svc', port: 1 }],
  metadata: { description: 'before' },
};

describe('lockedFieldChanges', () => {
  test('an identical body changes nothing', () => {
    expect(lockedFieldChanges({ ...stored }, stored)).toEqual([]);
  });

  test('metadata is not locked', () => {
    expect(
      lockedFieldChanges(
        { ...stored, metadata: { description: 'after' } },
        stored
      )
    ).toEqual([]);
  });

  test('object key order is not a change', () => {
    const body = {
      ...stored,
      buildInfo: { profile: 'release', rustc: '1.80.0' },
    };
    expect(lockedFieldChanges(body, stored)).toEqual([]);
  });

  test.each(LOCKED_FIELDS.filter(f => f !== 'minRuntimeVersion'))(
    'changing %s is reported',
    field => {
      const body = { ...stored, [field]: { changed: true } };
      expect(lockedFieldChanges(body, stored)).toEqual([field]);
    }
  );

  test.each(
    LOCKED_FIELDS.filter(f => !['minRuntimeVersion', 'signerId'].includes(f))
  )('dropping %s is reported', field => {
    const body = { ...stored };
    delete body[field];
    expect(lockedFieldChanges(body, stored)).toEqual([field]);
  });

  test('several changes are all reported', () => {
    const body = { ...stored, version: '2.0', abi: {} };
    expect(lockedFieldChanges(body, stored).sort()).toEqual(['abi', 'version']);
  });

  describe('signerId', () => {
    test('dropping a stored signerId is reported', () => {
      const body = { ...stored };
      delete body.signerId;
      expect(lockedFieldChanges(body, stored)).toEqual(['signerId']);
    });

    test('a version stored without one may gain one', () => {
      const legacy = { ...stored };
      delete legacy.signerId;
      expect(
        lockedFieldChanges({ ...legacy, signerId: 'did:key:z6MkNew' }, legacy)
      ).toEqual([]);
    });
  });

  describe('runtime floor', () => {
    test('either spelling of the same floor is not a change', () => {
      const body = { ...stored };
      delete body.minRuntimeVersion;
      body.min_runtime_version = '0.5.0';
      expect(lockedFieldChanges(body, stored)).toEqual([]);
    });

    test('a stored snake_case floor is honoured', () => {
      const snake = { ...stored, min_runtime_version: '0.5.0' };
      delete snake.minRuntimeVersion;
      expect(lockedFieldChanges({ ...snake }, snake)).toEqual([]);
      expect(
        lockedFieldChanges({ ...snake, min_runtime_version: '0.6.0' }, snake)
      ).toEqual(['minRuntimeVersion']);
    });

    test('a conflicting second spelling is reported', () => {
      const body = { ...stored, min_runtime_version: '9.0.0' };
      expect(lockedFieldChanges(body, stored)).toEqual(['minRuntimeVersion']);
    });

    test('no floor on either side defaults to 0.1.0 and is not a change', () => {
      const none = { ...stored };
      delete none.minRuntimeVersion;
      expect(lockedFieldChanges({ ...none }, none)).toEqual([]);
      expect(
        lockedFieldChanges({ ...none, minRuntimeVersion: '0.1.0' }, none)
      ).toEqual([]);
    });

    test('whitespace around the same floor is not a change', () => {
      expect(
        lockedFieldChanges({ ...stored, minRuntimeVersion: ' 0.5.0 ' }, stored)
      ).toEqual([]);
    });
  });
});
