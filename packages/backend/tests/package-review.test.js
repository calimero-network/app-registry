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

  describe('the trusted-publisher shortcut', () => {
    // The queue exists to stop a stranger publishing rubbish, not to make the
    // people who build this thing queue behind their own gate.
    const trusted = who =>
      createPackageReview(kv, { publisherOf: async () => who });

    it('approves a @calimero.network publisher on arrival', async () => {
      const r = trusted({ email: 'someone@calimero.network' });
      const rec = await r.getReview(pkg);
      expect(rec.state).toBe('approved');
      // ⚠️ Marked automatic, and NOT written as a record: an approval in the
      // audit trail that no admin made is a lie, and storing it would freeze
      // the answer if the package later left the organisation.
      expect(rec.auto).toBe(true);
      expect(rec.decidedBy).toBeNull();
      expect(await kv.get(reviewKey(pkg))).toBeNull();
    });

    it('approves the calimero-network organisation', async () => {
      const r = trusted({
        email: 'someone@example.com',
        orgSlug: 'calimero-network',
      });
      expect((await r.getReview(pkg)).state).toBe('approved');
    });

    it('leaves everyone else pending', async () => {
      const r = trusted({ email: 'carol@example.com', orgSlug: 'carols-apps' });
      expect((await r.getReview(pkg)).state).toBe('pending');
    });

    it('⚠️ an explicit DECLINE beats the shortcut', async () => {
      // This is what a takedown of a first-party package looks like. If the
      // shortcut won, an admin could not remove it.
      const r = trusted({ email: 'someone@calimero.network' });
      await r.setReview(pkg, {
        state: 'declined',
        by: 'admin@calimero.network',
      });
      const rec = await r.getReview(pkg);
      expect(rec.state).toBe('declined');
      expect(rec.auto).toBe(false);
      expect(await r.isApproved(pkg)).toBe(false);
    });

    it('is not applied at all without a resolver', async () => {
      // A missing dependency must stop the shortcut, never publish something.
      const r = createPackageReview(kv);
      expect((await r.getReview(pkg)).state).toBe('pending');
    });

    it('a resolver that throws is not a grant', async () => {
      const r = createPackageReview(kv, {
        publisherOf: async () => {
          throw new Error('redis is down');
        },
      });
      expect((await r.getReview(pkg)).state).toBe('pending');
    });

    it('is case-insensitive about the domain', async () => {
      const r = trusted({ email: 'Someone@Calimero.Network' });
      expect((await r.getReview(pkg)).state).toBe('approved');
    });

    it('does not match a lookalike domain', async () => {
      // ⚠️ `endsWith` on the bare word would match `evil-calimero.network`.
      const r = trusted({ email: 'attacker@notcalimero.network' });
      expect((await r.getReview(pkg)).state).toBe('pending');
    });
  });

  it('tracks decided packages for the queue', async () => {
    await review.setReview('a', { state: 'approved' });
    await review.setReview('b', { state: 'declined' });
    expect((await review.decidedPackages()).sort()).toEqual(['a', 'b']);
  });
});
