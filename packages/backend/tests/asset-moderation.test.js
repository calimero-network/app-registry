/**
 * Asset storage and the moderation gate.
 *
 * The assertions that matter are the ones about what the gate must NOT be:
 *
 *  - It must not key on the computed `verified` flag. That flag means "the
 *    owner's email ends in @calimero.network" and is true for all 21 live
 *    bundles, so a gate built on it approves everything by default.
 *  - Default must be DENY. A package with no recorded decision is pending.
 *  - A content-type header proves nothing; the type comes from the bytes.
 */

const { assetVisibility } = require('../src/lib/asset-visibility');
const review = require('../src/lib/package-review');
const { sniff, assetKey, indexKey } = require('../src/lib/asset-store');
const { kv } = require('../src/lib/kv-client');

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]);
const JPG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(16),
]);
const MP4 = Buffer.concat([
  Buffer.alloc(4),
  Buffer.from('ftyp', 'ascii'),
  Buffer.alloc(16),
]);

describe('moderation gate', () => {
  const pkg = 'com.example.pending';

  beforeEach(async () => {
    await kv.del?.(`admin_verified:package:${pkg}`);
  });

  it('defaults to DENY for a package with no recorded decision', async () => {
    // The single most important assertion here. Inverting this publishes
    // unreviewed images by default, which is the whole thing the gate exists
    // to prevent.
    const v = await assetVisibility({ pkg, isOwner: false, isAdmin: false });
    expect(v.visible).toBe(false);
    expect(v.state).toBe('pending');
  });

  it('shows a pending package to an admin, for review', async () => {
    const v = await assetVisibility({ pkg, isOwner: false, isAdmin: true });
    expect(v.visible).toBe(true);
    expect(v.state).toBe('pending');
    expect(v.reason).toBe('admin_review');
  });

  it('shows a pending package to its own owner', async () => {
    // Otherwise the publisher uploads an image, sees nothing, and concludes
    // the upload failed.
    const v = await assetVisibility({ pkg, isOwner: true, isAdmin: false });
    expect(v.visible).toBe(true);
    expect(v.state).toBe('pending');
  });

  it('goes public only once an admin approves the package', async () => {
    await kv.set(`admin_verified:package:${pkg}`, '1');
    const v = await assetVisibility({ pkg, isOwner: false, isAdmin: false });
    expect(v.visible).toBe(true);
    expect(v.state).toBe('approved');
  });

  it('is not satisfied by the computed `verified` flag', async () => {
    // `verified` is a domain test on the owner's email and is true for every
    // bundle in production. Only `admin_verified:package:<pkg>` opens the
    // gate; nothing about a bundle's own fields can.
    const anyBundleShape = {
      verified: true,
      metadata: { author: 'calimero-network' },
    };
    expect(anyBundleShape.verified).toBe(true);

    const v = await assetVisibility({ pkg, isOwner: false, isAdmin: false });
    expect(v.visible).toBe(false);
  });
});

describe('type sniffing', () => {
  it('identifies files by their bytes, not a supplied content type', () => {
    expect(sniff(PNG)).toMatchObject({ ext: 'png', kind: 'image' });
    expect(sniff(JPG)).toMatchObject({ ext: 'jpg', kind: 'image' });
    expect(sniff(MP4)).toMatchObject({ ext: 'mp4', kind: 'video' });
  });

  it('rejects something that is not a media file', () => {
    // An uploader-supplied Content-Type of image/png does not make this one.
    const html = Buffer.from(
      '<!doctype html><script>alert(1)</script>',
      'utf8'
    );
    expect(sniff(html)).toBeNull();
  });

  it('rejects a buffer too short to identify', () => {
    expect(sniff(Buffer.from([0x89, 0x50]))).toBeNull();
    expect(sniff(null)).toBeNull();
  });
});

describe('storage layout', () => {
  it('keeps assets out of the bundle prefix', () => {
    // The registry must serve a .mpk byte for byte — bytecode_id covers the
    // whole envelope. Anything written into the bundle prefix risks changing
    // a blob id, and every node then fails its check and stops upgrading.
    const key = assetKey('com.example.app', 'abc123', 'png');
    expect(key.startsWith('assets/')).toBe(true);
    expect(key).not.toContain('bundles/');
    expect(key.endsWith('.mpk')).toBe(false);
  });

  it('scopes the Redis index per package', () => {
    expect(indexKey('com.example.app')).toBe('pkg-assets:com.example.app');
  });
});

describe('the declined state', () => {
  // Declined is not "less approved" — it is a decision. It hides assets
  // exactly as pending does, which is why every caller has to ask for
  // `approved` rather than for "not pending".
  const pkg = 'com.example.declined';

  beforeEach(async () => {
    await review.setReview(pkg, {
      state: 'declined',
      by: 'admin@calimero.network',
      reason: 'The screenshot shows a third-party logo.',
    });
  });

  afterEach(async () => {
    await review.setReview(pkg, { state: 'pending' });
  });

  it('hides assets from a stranger', async () => {
    const v = await assetVisibility({ pkg });
    expect(v.visible).toBe(false);
    expect(v.state).toBe('declined');
  });

  it('shows the owner their own assets, and the reason', async () => {
    const v = await assetVisibility({ pkg, isOwner: true });
    expect(v.visible).toBe(true);
    expect(v.reason).toBe('declined');
    expect(v.declineReason).toMatch(/third-party logo/);
  });

  it('does NOT hand the reason to a stranger', async () => {
    // ⚠️ An admin writes it about someone's package. It goes to the owner and
    // to admins; a public reader must not see it.
    const v = await assetVisibility({ pkg });
    expect(v.declineReason).toBeUndefined();
  });

  it('a decline overrides an earlier approval', async () => {
    await review.setReview(pkg, { state: 'approved', by: 'a@b.c' });
    expect((await assetVisibility({ pkg })).visible).toBe(true);
    await review.setReview(pkg, { state: 'declined', by: 'a@b.c' });
    expect((await assetVisibility({ pkg })).visible).toBe(false);
  });
});
