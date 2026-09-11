/**
 * GET  /api/v2/orgs/:orgId/members — list members
 * POST /api/v2/orgs/:orgId/members — add member by username
 */

const {
  getOrg,
  getOrgMembers,
  getOrgMemberRole,
  getOrgMemberRoles,
  addOrgMember,
} = require('#api-lib/org-storage');
const {
  requireOrgAdminOrOwner,
  requireOrgOwner,
} = require('#api-lib/auth-helpers');
const { getUserByEmail, getUserByUsername } = require('#api-lib/user-storage');
const { isBot } = require('#api-lib/admin-storage');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async function handler(req, res) {
  const orgId = req.query?.orgId;
  if (!orgId || typeof orgId !== 'string') {
    return res
      .status(400)
      .json({ error: 'bad_request', message: 'Missing orgId' });
  }

  cors(res);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let org;
  try {
    org = await getOrg(orgId);
  } catch (e) {
    return res
      .status(500)
      .json({ error: 'internal', message: e?.message ?? String(e) });
  }
  if (!org) {
    return res
      .status(404)
      .json({ error: 'not_found', message: 'Organization not found' });
  }

  if (req.method === 'GET') {
    try {
      const emails = await getOrgMembers(orgId);

      // ⚠️ THREE WAVES, NOT FOUR ROUND TRIPS PER MEMBER.
      //
      // This asked for the role (itself TWO sequential `hGet`s, normalised
      // then raw), the profile and the bot flag one member at a time, all
      // `await`ed inside a `for` — so an org of N members cost ~4N serialised
      // Redis round trips to draw its member table. The roles now come from
      // one `hGetAll` of the org's role hash, and the per-member profile and
      // bot reads go out together.
      const [roleOf, profiles, botFlags] = await Promise.all([
        getOrgMemberRoles(orgId),
        Promise.all(emails.map(email => getUserByEmail(email))),
        Promise.all(emails.map(email => isBot(email))),
      ]);

      const members = emails.map((email, i) => ({
        email,
        username: profiles[i]?.username ?? null,
        verified: profiles[i]?.verified ?? email.endsWith('@calimero.network'),
        role: roleOf(email) || 'member',
        isBot: botFlags[i],
      }));
      return res.status(200).json({ members });
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  if (req.method === 'POST') {
    const { username, role } = req.body || {};
    if (!username || typeof username !== 'string') {
      return res.status(400).json({
        error: 'bad_request',
        message: 'Body must include username (string)',
      });
    }
    const memberUsername = username.trim().replace(/^@+/, '').toLowerCase();
    if (!memberUsername) {
      return res.status(400).json({
        error: 'bad_request',
        message: 'username cannot be empty',
      });
    }
    const roleNorm = role === 'admin' ? 'admin' : 'member';
    // Adding admin requires owner; adding member requires admin or owner
    if (roleNorm === 'admin') {
      const user = await requireOrgOwner(req, res, orgId);
      if (!user) return;
    } else {
      const user = await requireOrgAdminOrOwner(req, res, orgId);
      if (!user) return;
    }
    try {
      const profile = await getUserByUsername(memberUsername);
      if (!profile?.email) {
        return res.status(404).json({
          error: 'not_found',
          message: `User '@${memberUsername}' was not found`,
        });
      }
      const memberEmail = profile.email;
      const existingRole = await getOrgMemberRole(orgId, memberEmail);
      if (existingRole) {
        return res.status(409).json({
          error: 'conflict',
          message: `User '@${memberUsername}' is already a member of the organization`,
        });
      }
      await addOrgMember(orgId, memberEmail, roleNorm);
      return res.status(204).end();
    } catch (e) {
      return res
        .status(500)
        .json({ error: 'internal', message: e?.message ?? String(e) });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
