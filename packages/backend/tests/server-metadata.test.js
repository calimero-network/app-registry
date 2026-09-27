/**
 * Server-written metadata (author, `_ownerEmail`, `_adminVerified`) can be
 * neither set on publish nor changed by an edit.
 */

const {
  stripServerMetadata,
  keepServerMetadata,
} = require('@calimero-network/registry-shared/server-metadata');

describe('server metadata', () => {
  test('publish drops author and every internal key', () => {
    expect(
      stripServerMetadata({
        name: 'App',
        author: 'calimero-network',
        _ownerEmail: 'x@calimero.network',
        _adminVerified: true,
      })
    ).toEqual({ name: 'App' });
    expect(stripServerMetadata(undefined)).toEqual({});
  });

  test('an edit keeps the stored values and cannot add new ones', () => {
    const stored = {
      name: 'Old',
      author: 'alice',
      _ownerEmail: 'alice@example.com',
    };
    const incoming = {
      name: 'New',
      author: 'mallory',
      _ownerEmail: 'm@calimero.network',
      _adminVerified: true,
    };
    expect(keepServerMetadata(incoming, stored)).toEqual({
      name: 'New',
      author: 'alice',
      _ownerEmail: 'alice@example.com',
    });
  });
});
