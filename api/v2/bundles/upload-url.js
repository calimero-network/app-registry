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
const { resolveUser, rejectUnauthenticated } = require('#api-lib/auth-helpers');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')
    return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await resolveUser(req);
    if (!user?.email) return rejectUnauthenticated(req, res);

    const owner = crypto.createHash('sha256').update(user.email).digest('hex');
    const object = `uploads/${owner}/${crypto.randomUUID()}.mpk`;
    return res.status(200).json({ object, ...(await signedUploadUrl(object)) });
  } catch (error) {
    console.error('Upload URL Error:', error);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
