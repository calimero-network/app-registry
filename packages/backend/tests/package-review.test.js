/**
 * The moderation state machine.
 *
 * Every assertion here is about a way this can be wrong in production rather
 * than about the happy path:
 *
 *  - pending must be the default, including when the record is unreadable;
 *  - the 21 packages approved under the OLD boolean key must stay approved;
 *  - declined must hide assets exactly as pending does, while being a
 *    different state;
 *  - the admin's email is an audit field and must never be handed to a
 *    public reader.
 */

const {
  createPackageReview,
  reviewKey,
  legacyKey,
} = require('../../../shared/package-review');

/** A kv double with the surface this module actually touches. */
function fakeKv() {
  const store = new Map();
  const sets = new Map();
  return {
    store,
    sets,
    async get(k) {
      return store.has(k) ? store.get(k) : null;
    },
    async set(k, v) {
      store.set(k, v);
    },
    async del(k) {
      store.delete(k);
    },
    async sAdd(k, v) {
      if (!sets.has(k)) sets.set(k, new Set());
      sets.get(k).add(v);
    },
    async sMembers(k) {
      return [...(sets.get(k) || [])];
    },
  };
}

describe('package review state', () => {
  let kv;
  let review;
  const pkg = 'com.example.app';

  beforeEach(() => {
    kv = fakeKv();
    review = createPackageReview(kv);
  });

  it('defaults to pending with nothing recorded', async () => {
    // ⚠️ The single most important assertion in this file. Inverting it
    // publishes unreviewed images by default, which is the entire reason the
    // gate exists.
    const r = await review.getReview(pkg);
    expect(r.state).toBe('pending');
    expect(await review.isApproved(pkg)).toBe(false);
  });

  it('honours the legacy boolean key', async () => {
    // 21 packages are live carrying only this. A reader that ignored it would
    // un-approve every one of them at the moment of deploy.
    await kv.set(legacyKey(pkg), '1');
    const r = await review.getReview(pkg);
    expect(r.state).toBe('approved');
    expect(r.legacy).toBe(true);
    expect(await review.isApproved(pkg)).toBe(true);
  });

  it('treats an unparseable record as pending, not approved', async () => {
    await kv.set(reviewKey(pkg), '{not json');
    expect((await review.getReview(pkg)).state).toBe('pending');
  });

  it('treats an unknown state as pending, not approved', async () => {
    await kv.set(reviewKey(pkg), JSON.stringify({ state: 'probably-fine' }));
    expect((await review.getReview(pkg)).state).toBe('pending');
  });

  it('records who decided, when, and why', async () => {
    await review.setReview(pkg, {
      state: 'declined',
      by: 'admin@calimero.network',
      reason: 'Screenshot shows a third-party logo.',
    });
    const r = await review.getReview(pkg);
    expect(r.state).toBe('declined');
    expect(r.decidedBy).toBe('admin@calimero.network');
    expect(r.reason).toMatch(/third-party logo/);
    expect(Date.parse(r.decidedAt)).not.toBeNaN();
  });

  it('declined is NOT approved', async () => {
    // Anything asking "may this be seen" must ask for approved. A check
    // written as `state !== 'pending'` would make declining a package
    // publish it.
    await review.setReview(pkg, { state: 'declined', by: 'a@b.c' });
    expect(await review.isApproved(pkg)).toBe(false);
  });

  it('approving writes the legacy key and declining clears it', async () => {
    // Kept in step deliberately: `verified` badges, the admin listing and any
    // consumer still reading the old key would otherwise disagree with this
    // one on a live registry.
    await review.setReview(pkg, { state: 'approved', by: 'a@b.c' });
    expect(await kv.get(legacyKey(pkg))).toBe('1');

    await review.setReview(pkg, { state: 'declined', by: 'a@b.c' });
    expect(await kv.get(legacyKey(pkg))).toBeNull();
  });

  it('a later record wins over the legacy key', async () => {
    // The migration direction that actually happens: an old approval, then a
    // decline. The old key must not resurrect it.
    await kv.set(legacyKey(pkg), '1');
    await review.setReview(pkg, { state: 'declined', by: 'a@b.c' });
    expect((await review.getReview(pkg)).state).toBe('declined');
  });

  it('refuses a state it does not know', async () => {
    await expect(
      review.setReview(pkg, { state: 'approved-ish' })
    ).rejects.toThrow(/unknown review state/);
  });

  it('caps the reason rather than storing whatever was posted', async () => {
    await review.setReview(pkg, {
      state: 'declined',
      reason: 'x'.repeat(5000),
    });
    expect((await review.getReview(pkg)).reason.length).toBe(500);
  });

  it('tracks decided packages for the queue', async () => {
    await review.setReview('a', { state: 'approved' });
    await review.setReview('b', { state: 'declined' });
    expect((await review.decidedPackages()).sort()).toEqual(['a', 'b']);
  });
});
