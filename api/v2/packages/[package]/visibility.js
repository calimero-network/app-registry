/**
 * Package visibility.
 *
 *   GET /api/v2/packages/:package/visibility
 *   PUT /api/v2/packages/:package/visibility   { "visibility": "public" | "private" }
 *
 * Who: anyone who may manage the package — a Cloud token with the `publish`
 * scope whose role is `owner`/`admin` of the package's Cloud org, or a
 * registry account that is the package author, an admin/owner of its org, or
 * a site admin.
 *
 * public -> private takes effect at once (the public listing is edge-cached
 * for up to ~60 s, so it can linger there that long).
 * private -> public is a REQUEST: it goes to the admin review queue
 * (GET /api/admin/review-queue) and the package stays private until an admin
 * approves it (PATCH /api/admin/packages/:pkg { action: 'approve' }). Answered
 * 202. A site admin's own request applies at once.
 * PUT private while a public request is pending cancels the request.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const {
  requireAuth,
  canManagePackage,
  NOT_OWNER_MESSAGE,
} = require('#api-lib/auth-helpers');
const { isAdmin } = require('#api-lib/admin-storage');
const {
  getPackageRecord,
  visibilityOf,
  changeVisibility,
  publicRecord,
} = require('#api-lib/package-records');
const { appendAudit } = require('#api-lib/org-audit');

let storage;
const getStorage = () => (storage ??= new BundleStorageKV());

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  res.setHeader('Cache-Control', 'private, no-store');

  const pkg = req.query?.package;
  if (!pkg) {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'package required' });
  }

  const user = await requireAuth(req, res, { allowCloud: true });
  if (!user) return undefined;

  try {
    const store = getStorage();
    const versions = await store.getBundleVersions(pkg);
    const notFound = () =>
      res
        .status(404)
        .json({ error: 'not_found', message: `No such package: ${pkg}` });
    if (!versions?.length) return notFound();
    const latest = await store.getBundleManifest(pkg, versions[0]);
    const record = await getPackageRecord(pkg);

    if (!(await canManagePackage(pkg, latest, user))) {
      if (visibilityOf(record) === 'private') return notFound();
      return res
        .status(403)
        .json({ error: 'not_owner', message: NOT_OWNER_MESSAGE });
    }

    if (req.method === 'GET') {
      return res.status(200).json({ package: pkg, ...publicRecord(record) });
    }

    const to = String(req.body?.visibility || '').toLowerCase();
    if (to !== 'public' && to !== 'private') {
      return res.status(400).json({
        error: 'invalid_visibility',
        message: 'visibility must be "public" or "private"',
      });
    }

    const siteAdmin = !user.cloud && !!(await isAdmin(user.email));
    const result = await changeVisibility(pkg, to, {
      by: user.email,
      immediate: siteAdmin,
      latestManifest: latest,
    });

    if (result.changed) {
      await appendAudit(result.record.org_id, {
        type: result.pending ? 'visibility_request' : 'visibility_change',
        package: pkg,
        user,
        details: { from: result.from, to },
      });
    }

    return res.status(result.pending ? 202 : 200).json({
      package: pkg,
      ...publicRecord(result.record),
      ...(result.pending
        ? {
            message:
              'Making a package public needs an admin review; it stays private until approved.',
          }
        : {}),
    });
  } catch (err) {
    console.error('visibility error:', err);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
