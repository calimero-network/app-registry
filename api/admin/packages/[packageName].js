/**
 * Admin package management.
 * DELETE /api/admin/packages/:packageName      — delete entire package
 * PATCH  /api/admin/packages/:packageName      — body: { action }
 *
 * Actions: 'approve' | 'decline' | 'verify' | 'unverify' | 'delete_version'.
 *
 * ⚠️ `verify`/`unverify` ARE KEPT, AND THEY ARE NOT ALIASES. Approval is a
 * three-state decision now (pending / approved / declined) because a boolean
 * could not tell "reviewed and rejected" from "never looked at" — a declined
 * package came back to the queue forever and its owner was never told why.
 * The old pair still works so a half-deployed admin UI does not break, and
 * both write through the same record.
 */
const semver = require('semver');
const { requireAdmin } = require('#api-lib/auth-helpers');
const { kv } = require('#api-lib/kv-client');
const { setAdminVerified } = require('#api-lib/admin-storage');
const review = require('#api-lib/package-review');
const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');

let storage;
const getStorage = () => (storage ??= new BundleStorageKV());

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { packageName } = req.query;
  if (!packageName)
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'packageName required' });

  if (req.method === 'DELETE') {
    // Both delete paths funnel through the one cleanup routine so they cannot
    // drift: it removes every bundle/version, the download counter, the review
    // decision, all assets and the org link, and tombstones the name so it
    // cannot later be silently re-registered and inherit the old trust.
    await getStorage().deletePackage(packageName);
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { action, version } = req.body || {};

    if (action === 'delete_version') {
      if (!version) return res.status(400).json({ error: 'version required' });
      // Shared per-version delete: clears manifest, binary, blob and interface
      // indexes, drops the package from bundles:all when it empties, and
      // tombstones "<pkg>/<version>" so that exact release cannot be replayed.
      await getStorage().deleteBundleVersion(packageName, version);
      // Preserve the counter cleanup the manual path did when a package empties.
      const remaining = await kv.sMembers(`bundle-versions:${packageName}`);
      if (!remaining.length) {
        await kv.del(`downloads:${packageName.toLowerCase()}`);
      }
      return res.status(200).json({ ok: true });
    }

    const versions = await kv.sMembers(`bundle-versions:${packageName}`);
    const latest = versions.length
      ? versions.sort((a, b) =>
          semver.rcompare(
            semver.valid(a) || '0.0.0',
            semver.valid(b) || '0.0.0'
          )
        )[0]
      : null;

    // The decision, with an audit trail. `_adminVerified` on the manifest is
    // kept in step so the `verified` badge and any consumer reading it agree
    // with the record.
    const stampManifest = async on => {
      if (!latest) return;
      const raw = await kv.get(`bundle:${packageName}/${latest}`);
      if (!raw) return;
      const stored = JSON.parse(raw);
      stored.json.metadata = stored.json.metadata || {};
      if (on) stored.json.metadata._adminVerified = true;
      else delete stored.json.metadata._adminVerified;
      await kv.set(`bundle:${packageName}/${latest}`, JSON.stringify(stored));
    };

    if (action === 'approve' || action === 'decline') {
      const state = action === 'approve' ? 'approved' : 'declined';
      await review.setReview(packageName, {
        state,
        by: admin.email || null,
        reason: (req.body || {}).reason || '',
      });
      await stampManifest(state === 'approved');
      return res.status(200).json({ ok: true, state });
    }

    if (action === 'verify' || action === 'unverify') {
      const on = action === 'verify';
      await review.setReview(packageName, {
        state: on ? 'approved' : 'pending',
        by: admin.email || null,
      });
      await setAdminVerified('package', packageName, on);
      await stampManifest(on);
      return res.status(200).json({ ok: true });
    }

    return res
      .status(400)
      .json({ error: 'bad_action', message: 'Unknown action' });
  }

  return res.status(405).end();
};
