/**
 * GET /api/v2/invitations — the caller's pending organization invitations
 */

const { requireAuth } = require('#api-lib/auth-helpers');
const { flow } = require('#api-lib/invitation-flow');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const { status, body } = await flow.listMine(user.email);
    return res.status(status).json(body);
  } catch (e) {
    console.error('invitations route error:', e);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
