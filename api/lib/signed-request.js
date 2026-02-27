/**
 * Signed request helpers for Vercel serverless (org API).
 * Reuses backend verify + canonicalize; org-storage for admin check.
 */

const canonicalize = require('canonicalize');
const {
  verifySignature,
  validatePublicKey,
} = require('../../packages/backend/src/lib/verify');
const { isOrgAdmin } = require('../../packages/backend/src/lib/org-storage');

/**
 * Build payload string for signature verification: method + path + canonical body.
 * @param {string} method
 * @param {string} pathname - path without query
 * @param {object} body - parsed request body (optional)
 */
function buildSignedPayload(method, pathname, body) {
  const bodyStr =
    body != null && typeof body === 'object' && Object.keys(body).length > 0
      ? canonicalize(body)
      : '';
  return `${method}\n${pathname}\n${bodyStr}`;
}

/**
 * Get pubkey from request: X-Pubkey header.
 */
function getPubkeyFromRequest(req) {
  const pubkey = req.headers['x-pubkey'];
  return typeof pubkey === 'string' && pubkey.trim() ? pubkey.trim() : null;
}

/**
 * Verify signed request. Returns { pubkey } or sends 401/400 and returns null.
 */
async function requireSignedRequest(req, res) {
  const pubkey = getPubkeyFromRequest(req);
  const signature = req.headers['x-signature'];
  if (!pubkey || !signature) {
    res.status(401).json({
      error: 'unauthorized',
      message: 'X-Pubkey and X-Signature required for this operation',
    });
    return null;
  }
  if (!validatePublicKey(pubkey)) {
    res.status(400).json({
      error: 'invalid_pubkey',
      message: 'X-Pubkey is not a valid public key',
    });
    return null;
  }
  const pathname = (req.url || '').split('?')[0];
  const payload = buildSignedPayload(req.method, pathname, req.body || {});
  const valid = await verifySignature(pubkey, signature, payload);
  if (!valid) {
    res.status(401).json({
      error: 'invalid_signature',
      message: 'X-Signature verification failed',
    });
    return null;
  }
  return { pubkey };
}

/**
 * Require signed request and that pubkey is admin of orgId.
 * Returns { pubkey } or sends error and returns null.
 */
async function requireOrgAdmin(req, res, orgId) {
  const result = await requireSignedRequest(req, res);
  if (result === null) return null;
  const admin = await isOrgAdmin(orgId, result.pubkey);
  if (!admin) {
    res.status(403).json({
      error: 'forbidden',
      message: 'Only an organization admin can perform this action',
    });
    return null;
  }
  return result;
}

module.exports = {
  buildSignedPayload,
  getPubkeyFromRequest,
  requireSignedRequest,
  requireOrgAdmin,
};
