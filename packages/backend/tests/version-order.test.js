const fs = require('fs');
const path = require('path');
const { versionOrderRefusal } = require('../src/lib/v2-utils');

describe('versionOrderRefusal', () => {
  test.each([
    ['1.0.1', '1.0.0'],
    ['2.0.0', '1.9.9'],
    ['1.1.0-rc.1', '1.0.0'],
    ['1.0.0', '1.0.0-rc.2'],
  ])('allows %s after %s', (incoming, latest) => {
    expect(versionOrderRefusal(incoming, latest)).toBeNull();
  });

  test.each([
    ['1.0.0', '1.0.0'],
    ['0.9.0', '1.0.0'],
    ['1.0.0-rc.1', '1.0.0'],
    ['1.2.0-beta', '1.2.0-rc.1'],
  ])('refuses %s after %s', (incoming, latest) => {
    expect(versionOrderRefusal(incoming, latest)).toEqual({
      status: 400,
      body: {
        error: 'version_not_allowed',
        message: `New version (${incoming}) must be greater than latest (${latest}).`,
      },
    });
  });
});

describe('every publish route shares the version ordering check', () => {
  const ROOT = path.resolve(__dirname, '../../..');

  test.each(['api/v2/bundles/push.js', 'api/v2/bundles/push-file.js'])(
    '%s calls versionOrderRefusal',
    rel => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).toMatch(/versionOrderRefusal\(/);
    }
  );
});
