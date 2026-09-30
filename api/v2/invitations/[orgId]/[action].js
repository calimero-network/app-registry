/**
 * POST /api/v2/invitations/:orgId/accept  — join the organization
 * POST /api/v2/invitations/:orgId/decline — discard the invitation
 */

const { requireAuth } = require('#api-lib/auth-helpers');
const { flow } = require('#api-lib/invitation-flow');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  const orgId = req.query?.orgId;
  const action = req.query?.action;
  if (
    !orgId ||
    !action ||
    typeof orgId !== 'string' ||
    typeof action !== 'string'
  ) {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'Missing orgId or action' });
  }

  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;
  try {
    const { status, body } = await flow.respond(orgId, user.email, action);
    return body ? res.status(status).json(body) : res.status(status).end();
  } catch (e) {
    console.error('invitations route error:', e);
    return res
      .status(500)
      .json({ error: 'internal_error', message: 'Internal error' });
  }
};
