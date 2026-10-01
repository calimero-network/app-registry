/**
 * Organization invitation flow: invite, list, revoke, accept, decline.
 * Used by both the Vercel serverless API and Fastify backend. Callers do the
 * authentication and role checks; each function returns { status, body }.
 */

function normUsername(username) {
  return typeof username === 'string'
    ? username.trim().replace(/^@+/, '').toLowerCase()
    : '';
}

async function resolveMemberEmail(getUserByUsername, param) {
  if (typeof param !== 'string' || !param.trim()) return null;
  if (param.includes('@')) return param.trim();
  const profile = await getUserByUsername(normUsername(param));
  return profile?.email ?? null;
}

function createInvitationFlow(deps) {
  const {
    invitations,
    getOrg,
    getOrgMemberRole,
    addOrgMember,
    getUserByEmail,
    getUserByUsername,
    isBot,
  } = deps;

  async function usernameOf(email) {
    if (!email) return null;
    const profile = await getUserByEmail(email);
    return profile?.username ?? null;
  }

  async function invite({ orgId, username, role, inviterEmail }) {
    const memberUsername = normUsername(username);
    const profile = await getUserByUsername(memberUsername);
    if (!profile?.email) {
      return {
        status: 404,
        body: {
          error: 'not_found',
          message: `User '@${memberUsername}' was not found`,
        },
      };
    }
    const email = profile.email.toLowerCase();
    if (await getOrgMemberRole(orgId, email)) {
      return {
        status: 409,
        body: {
          error: 'conflict',
          message: `User '@${memberUsername}' is already a member of the organization`,
        },
      };
    }
    const roleNorm = role === 'admin' ? 'admin' : 'member';
    if (await isBot(email)) {
      if (profile.botOrg !== orgId) {
        return {
          status: 403,
          body: {
            error: 'forbidden',
            message:
              'A bot account can only join the organization it belongs to',
          },
        };
      }
      await addOrgMember(orgId, email, roleNorm);
      return { status: 204 };
    }
    if (await invitations.get(orgId, email)) {
      return {
        status: 409,
        body: {
          error: 'already_invited',
          message: `User '@${memberUsername}' already has a pending invitation`,
        },
      };
    }
    const created = await invitations.create(orgId, email, {
      role: roleNorm,
      invitedBy: inviterEmail,
    });
    return {
      status: 202,
      body: {
        status: 'invited',
        invitation: {
          username: memberUsername,
          role: created.role,
          createdAt: created.createdAt,
          expiresAt: created.expiresAt,
        },
      },
    };
  }

  async function listForOrg(orgId) {
    const pending = await invitations.listForOrg(orgId);
    const rows = await Promise.all(
      pending.map(async inv => ({
        username: await usernameOf(inv.email),
        role: inv.role,
        invitedBy: await usernameOf(inv.invitedBy),
        createdAt: inv.createdAt,
        expiresAt: inv.expiresAt,
      }))
    );
    return { status: 200, body: { invitations: rows } };
  }

  async function revoke(orgId, username) {
    const profile = await getUserByUsername(normUsername(username));
    const email = profile?.email?.toLowerCase();
    if (!email || !(await invitations.get(orgId, email))) {
      return {
        status: 404,
        body: { error: 'not_found', message: 'No pending invitation found' },
      };
    }
    await invitations.remove(orgId, email);
    return { status: 204 };
  }

  async function listMine(email) {
    const pending = await invitations.listForEmail(email);
    const rows = await Promise.all(
      pending.map(async inv => {
        const org = await getOrg(inv.orgId);
        if (!org) {
          await invitations.remove(inv.orgId, email);
          return null;
        }
        return {
          org: { id: org.id, name: org.name, slug: org.slug },
          role: inv.role,
          invitedBy: await usernameOf(inv.invitedBy),
          createdAt: inv.createdAt,
          expiresAt: inv.expiresAt,
        };
      })
    );
    return { status: 200, body: { invitations: rows.filter(Boolean) } };
  }

  async function respond(orgId, email, action) {
    if (action !== 'accept' && action !== 'decline') {
      return {
        status: 400,
        body: {
          error: 'bad_request',
          message: 'action must be "accept" or "decline"',
        },
      };
    }
    const pending = await invitations.get(orgId, email);
    if (!pending) {
      return {
        status: 404,
        body: { error: 'not_found', message: 'No pending invitation found' },
      };
    }
    await invitations.remove(orgId, email);
    if (action === 'decline') return { status: 204 };
    if (!(await getOrg(orgId))) {
      return {
        status: 404,
        body: { error: 'not_found', message: 'Organization not found' },
      };
    }
    if (!(await getOrgMemberRole(orgId, email))) {
      await addOrgMember(orgId, email, pending.role);
    }
    return { status: 204 };
  }

  return { invite, listForOrg, revoke, listMine, respond };
}

module.exports = { createInvitationFlow, normUsername, resolveMemberEmail };
