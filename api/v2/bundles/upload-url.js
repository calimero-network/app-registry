/**
 * V2 Bundle Upload URL API
 * POST /api/v2/bundles/upload-url
 * Returns a signed URL to PUT a .mpk straight to storage (Vercel caps function
 * request bodies at 4.5 MB); reference the returned `object` as `_upload` in push.
 */

const crypto = require('crypto');
const {
  signedUploadUrl,
} = require('@calimero-network/registry-backend/src/lib/blob-store');
const {
  isStaffEmail,
} = require('@calimero-network/registry-backend/src/lib/metadata-policy');
const { isBot, isAdmin } = require('#api-lib/admin-storage');
const { kv } = require('#api-lib/kv-client');
const {
  resolveUser,
  rejectUnauthenticated,
  hasCloudScope,
} = require('#api-lib/auth-helpers');

const RATE_LIMIT = 100; // grants per account per window; a full Release publishes ~25 apps from one bot
const RATE_WINDOW_SECONDS = 3600;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await resolveUser(req, { allowCloud: true });
    if (!user?.email) return rejectUnauthenticated(req, res);

    // Any Google account can sign in; an open endpoint would let anyone park large objects in the bucket.
    // A Cloud token with the `publish` scope is accepted: Cloud orgs are
    // vetted by the Cloud manager, and the rate limit below still applies.
    const email = user.email;
    const allowed = user.cloud
      ? hasCloudScope(user, 'publish')
      : isStaffEmail(email) || (await isBot(email)) || (await isAdmin(email));
    if (!allowed) {
      return res.status(403).json({
        error: 'forbidden',
        message:
          'Direct upload is limited to bot, admin and staff accounts and Cloud tokens with the publish scope; publish with _binary or /push-file.',
      });
    }

    const owner = crypto.createHash('sha256').update(email).digest('hex');
    const key = `upload-url-rate:${owner}`;
    await kv.setNXEx(key, '0', RATE_WINDOW_SECONDS);
    if ((await kv.incr(key)) > RATE_LIMIT) {
      res.setHeader('Retry-After', String(RATE_WINDOW_SECONDS));
      return res.status(429).json({
        error: 'rate_limited',
        message: `At most ${RATE_LIMIT} upload URLs per hour; try again later.`,
      });
    }

    const object = `uploads/${owner}/${crypto.randomUUID()}.mpk`;
    return res.status(200).json({ object, ...(await signedUploadUrl(object)) });
  } catch (error) {
    console.error('Upload URL Error:', error);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
