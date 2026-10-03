/**
 * NPM-style organization API: CRUD orgs, members, package↔org link.
 * Write routes require Google OAuth session cookie or Authorization: Bearer <api-token>.
 * Admin-gated writes additionally check org membership role.
 */

const {
  getOrg,
  setOrg,
  getOrgMembers,
  isOrgMember,
  addOrgMember,
  removeOrgMember,
  getOrgMemberRole,
  updateOrgMemberRole,
  isOrgOwner,
  isOrgAdminOrOwner,
  getOrgsByMember,
  getOrgIdsByMember,
  getPkg2Org,
  setPkg2Org,
  deletePkg2Org,
  getPackagesByOrg,
  deleteOrg,
} = require('../lib/org-storage');
const { verifySessionToken, verifyApiToken } = require('../lib/auth');
const { getUserByEmail, getUserByUsername } = require('../lib/user-storage');
const {
  isBlacklisted,
  isBot,
  isAdmin,
  setAdminVerified,
} = require('../lib/admin-storage');
const { kv } = require('../lib/kv-client');
const {
  isReservedOrgSlug,
  isReservedOrgName,
  normalizeOrgName,
} = require('@calimero-network/registry-shared/org-slugs');
const {
  TRUSTED_ORG_SLUGS,
} = require('@calimero-network/registry-shared/package-review');
const {
  manifestOwnedByUser,
} = require('@calimero-network/registry-shared/package-permissions');
const {
  validateOrgName,
  validateOrgMetadata,
  countOwnedOrgs,
  MAX_OWNED_ORGS_PER_ACCOUNT,
} = require('@calimero-network/registry-shared/org-validation');
const { flow: invitationFlow } = require('../lib/invitation-flow');
const {
  resolveMemberEmail,
} = require('@calimero-network/registry-shared/org-invitation-flow');
const { BundleStorageKV } = require('../lib/bundle-storage-kv');
const config = require('../config');

const bundleStorage = new BundleStorageKV();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

async function getSessionUser(request) {
  const cookieName = config.auth?.cookieName || 'app_registry_session';
  const sessionSecret = config.auth?.sessionSecret;
  const token = request.cookies?.[cookieName];
  if (!sessionSecret || !token) return null;
  try {
    return await verifySessionToken(token, sessionSecret);
  } catch {
    return null;
  }
}

/**
 * Resolve the current user without gating — used by the public read routes that
 * tailor what they expose (e.g. member emails) to who is asking, and must not
 * 401 an anonymous caller. Returns { email } or null.
 */
async function resolveOptionalUser(request) {
  const sessionUser = await getSessionUser(request);
  if (sessionUser?.email) return { email: sessionUser.email };
  const auth = request.headers?.['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const tokenData = await verifyApiToken(auth.slice(7));
    if (tokenData?.email) return { email: tokenData.email };
  }
  return null;
}

/**
 * Bots may publish and nothing else, and publishing resolves its user without
 * requireAuth. Denying here keeps every requireAuth-guarded route closed to
 * them, including ones added later.
 */
async function denyBot(reply, user) {
  if (!(await isBot(user.email))) return user;
  reply.code(403).send({
    error: 'bot_forbidden',
    message: 'Bot accounts may only publish packages and new versions of them',
  });
  return null;
}

/**
 * Resolve the current user from session cookie or Bearer token.
 * Returns { email, name, username } or sends 401 and returns null.
 */
async function requireAuth(request, reply) {
  // Try session cookie
  const sessionUser = await getSessionUser(request);
  if (sessionUser?.email) {
    if (await isBlacklisted(sessionUser.email)) {
      reply.code(403).send({
        error: 'account_suspended',
        message: 'This account has been suspended',
      });
      return null;
    }
    const profile = await getUserByEmail(sessionUser.email);
    return denyBot(reply, {
      email: sessionUser.email,
      name: sessionUser.name,
      username: profile?.username ?? null,
    });
  }

  // Try Bearer token
  const auth = request.headers?.['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const tokenData = await verifyApiToken(auth.slice(7));
    if (tokenData?.email) {
      if (await isBlacklisted(tokenData.email)) {
        reply.code(403).send({
          error: 'account_suspended',
          message: 'This account has been suspended',
        });
        return null;
      }
      const profile = await getUserByEmail(tokenData.email);
      return denyBot(reply, {
        email: tokenData.email,
        name: tokenData.name,
        username: profile?.username ?? null,
      });
    }
  }

  reply.code(401).send({
    error: 'unauthorized',
    message:
      'Login required or provide an API token (Authorization: Bearer <token>)',
  });
  return null;
}

/**
 * Require that the caller is the owner of orgId.
 * Returns { email, name } or sends error and returns null.
 */
async function requireOrgOwner(request, reply, orgId) {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  const owner = await isOrgOwner(orgId, user.email);
  if (!owner) {
    reply.code(403).send({
      error: 'forbidden',
      message: 'Only an organization owner can perform this action',
    });
    return null;
  }
  return user;
}

/**
 * Require that the caller is admin or owner of orgId.
 * Returns { email, name } or sends error and returns null.
 */
async function requireOrgAdminOrOwner(request, reply, orgId) {
  const user = await requireAuth(request, reply);
  if (!user) return null;
  const allowed = await isOrgAdminOrOwner(orgId, user.email);
  if (!allowed) {
    reply.code(403).send({
      error: 'forbidden',
      message: 'Only an organization admin or owner can perform this action',
    });
    return null;
  }
  return user;
}

/** Count how many owners the org has. */
async function countOrgOwners(orgId) {
  const members = await getOrgMembers(orgId);
  let n = 0;
  for (const email of members) {
    const role = await getOrgMemberRole(orgId, email);
    if (role === 'owner') n++;
  }
  return n;
}

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;
const MAX_SLUG_LENGTH = 64;

async function orgRoutes(server) {
  // GET /api/v2/orgs?member=<email> — list orgs the member belongs to (auth: self or admin)
  // GET /api/v2/orgs?package=<name>  — get single org that owns a package (no auth)
  server.get('/api/v2/orgs', async (request, reply) => {
    const pkg = request.query?.package;
    if (pkg && typeof pkg === 'string') {
      const orgId = await getPkg2Org(pkg.trim());
      if (!orgId) return reply.send(null);
      const org = await getOrg(orgId);
      return reply.send(org ?? null);
    }
    const member = request.query?.member;
    if (!member || typeof member !== 'string') {
      return reply.send([]);
    }
    const email = member.trim();
    if (!isValidEmail(email)) {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'Query member must be a valid email address',
      });
    }
    // Privacy: this was an unauthenticated oracle for which orgs any email
    // belongs to. Require auth and only let a caller look up their own email
    // (case-insensitive), unless they are a site admin. Mirrors the Vercel
    // handler.
    const caller = await requireAuth(request, reply);
    if (!caller) return;
    if (
      caller.email.toLowerCase() !== email.toLowerCase() &&
      !(await isAdmin(caller.email))
    ) {
      return reply.code(403).send({
        error: 'forbidden',
        message: 'You may only look up organizations for your own account',
      });
    }
    const orgs = await getOrgsByMember(email);
    return reply.send(orgs);
  });

  // POST /api/v2/orgs — create org (session or token; creator becomes first admin)
  server.post('/api/v2/orgs', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { name, slug } = request.body || {};
    if (
      !name ||
      typeof name !== 'string' ||
      !slug ||
      typeof slug !== 'string'
    ) {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'Body must include name and slug (strings)',
      });
    }
    const nameError = validateOrgName(name);
    if (nameError) {
      return reply.code(400).send({ error: 'bad_request', message: nameError });
    }
    const slugNorm = slug.toLowerCase().trim();
    if (!SLUG_REGEX.test(slugNorm) || slugNorm.length > MAX_SLUG_LENGTH) {
      return reply.code(400).send({
        error: 'bad_request',
        message: `slug must be lowercase alphanumeric and hyphens (e.g. my-org), at most ${MAX_SLUG_LENGTH} characters`,
      });
    }
    const callerIsAdmin = await isAdmin(user.email);
    if (isReservedOrgSlug(slugNorm) && !callerIsAdmin) {
      return reply.code(403).send({
        error: 'reserved_slug',
        message: 'This organization slug is reserved',
      });
    }
    if (isReservedOrgName(name) && !callerIsAdmin) {
      return reply.code(403).send({
        error: 'reserved_name',
        message: 'This organization name is reserved',
      });
    }
    if (
      !callerIsAdmin &&
      (await countOwnedOrgs(
        { getOrgIdsByMember, getOrgMemberRole },
        user.email
      )) >= MAX_OWNED_ORGS_PER_ACCOUNT
    ) {
      return reply.code(403).send({
        error: 'org_limit',
        message: `An account can own at most ${MAX_OWNED_ORGS_PER_ACCOUNT} organizations`,
      });
    }
    const orgId = slugNorm;
    // Reserve the slug atomically (mirrors api/v2/orgs/index.js).
    const reserved = await kv.setNX(`org:by_slug:${slugNorm}`, orgId);
    if (!reserved || (await getOrg(orgId))) {
      return reply.code(409).send({
        error: 'conflict',
        message: 'An organization with this slug already exists',
      });
    }
    const org = {
      id: orgId,
      name: normalizeOrgName(name),
      slug: slugNorm,
    };
    try {
      await setOrg(org);
      await addOrgMember(orgId, user.email, 'owner');
    } catch (e) {
      await kv.del(`org:by_slug:${slugNorm}`);
      throw e;
    }
    return reply.code(201).send(org);
  });

  // GET /api/v2/orgs/:orgId — get org (public)
  server.get('/api/v2/orgs/:orgId', async (request, reply) => {
    const org = await getOrg(request.params.orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    return org;
  });

  // PATCH /api/v2/orgs/:orgId — update org (admin or owner)
  server.patch('/api/v2/orgs/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const user = await requireOrgAdminOrOwner(request, reply, orgId);
    if (!user) return;
    const { name, metadata } = request.body || {};
    const updates = {};
    if (name !== undefined) {
      const nameError = validateOrgName(name);
      if (nameError) {
        return reply
          .code(400)
          .send({ error: 'bad_request', message: nameError });
      }
      const nameNorm = normalizeOrgName(name);
      if (
        nameNorm !== org.name &&
        isReservedOrgName(nameNorm) &&
        !TRUSTED_ORG_SLUGS.includes(org.slug) &&
        !(await isAdmin(user.email))
      ) {
        return reply.code(403).send({
          error: 'reserved_name',
          message: 'This organization name is reserved',
        });
      }
      updates.name = nameNorm;
    }
    if (metadata !== undefined) {
      const checked = validateOrgMetadata(metadata);
      if (checked.error) {
        return reply
          .code(400)
          .send({ error: 'invalid_metadata', message: checked.error });
      }
      updates.metadata = checked.value;
    }
    if (Object.keys(updates).length === 0) {
      return reply.send(org);
    }
    const updated = { ...org, ...updates };
    await setOrg(updated);
    return reply.send(updated);
  });

  // DELETE /api/v2/orgs/:orgId — delete org and all its data (owner only)
  server.delete('/api/v2/orgs/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const user = await requireOrgOwner(request, reply, orgId);
    if (!user) return;
    await deleteOrg(orgId);
    await setAdminVerified('org', orgId, false);
    return reply.code(204).send();
  });

  // POST /api/v2/orgs/:orgId/members — invite a member by username
  server.post('/api/v2/orgs/:orgId/members', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const { username, role } = request.body || {};
    if (!username || typeof username !== 'string') {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'Body must include username (string)',
      });
    }
    const memberUsername = username.trim().replace(/^@+/, '').toLowerCase();
    if (!memberUsername) {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'username cannot be empty',
      });
    }
    const roleNorm = role === 'admin' ? 'admin' : 'member';
    const inviter =
      roleNorm === 'admin'
        ? await requireOrgOwner(request, reply, orgId)
        : await requireOrgAdminOrOwner(request, reply, orgId);
    if (!inviter) return;
    const { status, body } = await invitationFlow.invite({
      orgId,
      username: memberUsername,
      role: roleNorm,
      inviterEmail: inviter.email,
    });
    return reply.code(status).send(body);
  });

  // GET /api/v2/orgs/:orgId/invitations — pending invitations (admin/owner)
  server.get('/api/v2/orgs/:orgId/invitations', async (request, reply) => {
    const { orgId } = request.params;
    if (!(await getOrg(orgId))) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const user = await requireOrgAdminOrOwner(request, reply, orgId);
    if (!user) return;
    const { status, body } = await invitationFlow.listForOrg(orgId);
    return reply.code(status).send(body);
  });

  // DELETE /api/v2/orgs/:orgId/invitations/:username — revoke (admin/owner)
  server.delete(
    '/api/v2/orgs/:orgId/invitations/:username',
    async (request, reply) => {
      const { orgId, username } = request.params;
      if (!(await getOrg(orgId))) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'Organization not found',
        });
      }
      const user = await requireOrgAdminOrOwner(request, reply, orgId);
      if (!user) return;
      const { status, body } = await invitationFlow.revoke(orgId, username);
      return reply.code(status).send(body);
    }
  );

  // GET /api/v2/invitations — the caller's pending invitations
  server.get('/api/v2/invitations', async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { status, body } = await invitationFlow.listMine(user.email);
    return reply.code(status).send(body);
  });

  // POST /api/v2/invitations/:orgId/:action — accept or decline
  server.post('/api/v2/invitations/:orgId/:action', async (request, reply) => {
    const { orgId, action } = request.params;
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { status, body } = await invitationFlow.respond(
      orgId,
      user.email,
      action
    );
    return reply.code(status).send(body);
  });

  // PATCH /api/v2/orgs/:orgId/members/:email — update member role (owner only; promote/demote admin/member)
  server.patch('/api/v2/orgs/:orgId/members/:email', async (request, reply) => {
    const { orgId, email: memberParam } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const memberEmail = await resolveMemberEmail(
      getUserByUsername,
      memberParam
    );
    if (!memberEmail) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'User is not a member of this organization',
      });
    }
    const user = await requireOrgOwner(request, reply, orgId);
    if (!user) return;
    const { role } = request.body || {};
    if (role !== 'admin' && role !== 'member' && role !== 'owner') {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'role must be "admin", "member", or "owner"',
      });
    }
    // SECURITY: updateOrgMemberRole writes a role for ANY address, even one
    // absent from the members set — a "ghost admin" that the admin/owner checks
    // then honour although the member list never shows them. Refuse a role change
    // for anyone who is not currently a member of the org.
    if (!(await isOrgMember(orgId, memberEmail))) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'User is not a member of this organization',
      });
    }
    const currentRole = await getOrgMemberRole(orgId, memberEmail);
    if (currentRole === 'owner' && role !== 'owner') {
      const ownerCount = await countOrgOwners(orgId);
      if (ownerCount <= 1) {
        return reply.code(409).send({
          error: 'last_owner',
          message:
            'Cannot demote the last owner. Promote another member to owner first.',
        });
      }
    }
    await updateOrgMemberRole(orgId, memberEmail, role);
    return reply.code(204).send();
  });

  // DELETE /api/v2/orgs/:orgId/members/:email — remove member (admin/owner, or self-leave)
  server.delete(
    '/api/v2/orgs/:orgId/members/:email',
    async (request, reply) => {
      const { orgId, email: memberParam } = request.params;
      const org = await getOrg(orgId);
      if (!org) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'Organization not found',
        });
      }
      const memberEmail = await resolveMemberEmail(
        getUserByUsername,
        memberParam
      );
      if (!memberEmail) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'User is not a member of this organization',
        });
      }
      const user = await requireAuth(request, reply);
      if (!user) return;
      const isSelf = user.email.toLowerCase() === memberEmail.toLowerCase();
      let callerRole = null;
      if (!isSelf) {
        callerRole = await getOrgMemberRole(orgId, user.email);
        if (callerRole !== 'admin' && callerRole !== 'owner') {
          return reply.code(403).send({
            error: 'forbidden',
            message:
              'Only an organization admin or owner can remove other members',
          });
        }
      }
      const targetRole = await getOrgMemberRole(orgId, memberEmail);
      // SECURITY: an admin removing a privileged member could evict the org's
      // owners (or fellow admins) and seize control — the last-owner guard alone
      // does not stop it. Only an owner may remove an owner or admin; admins are
      // limited to plain members. Self-removal stays allowed (last-owner guard
      // below still applies).
      if (
        !isSelf &&
        (targetRole === 'owner' || targetRole === 'admin') &&
        callerRole !== 'owner'
      ) {
        return reply.code(403).send({
          error: 'forbidden',
          message: 'Only an organization owner can remove an owner or admin',
        });
      }
      if (targetRole === 'owner') {
        const ownerCount = await countOrgOwners(orgId);
        if (ownerCount <= 1) {
          return reply.code(409).send({
            error: 'last_owner',
            message:
              'Cannot remove the last owner. Promote another member to owner first.',
          });
        }
      }
      await removeOrgMember(orgId, memberEmail);
      return reply.code(204).send();
    }
  );

  // POST /api/v2/orgs/:orgId/packages — link package to org (admin or owner; must own the package)
  server.post('/api/v2/orgs/:orgId/packages', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const user = await requireOrgAdminOrOwner(request, reply, orgId);
    if (!user) return;
    const { package: pkg } = request.body || {};
    if (!pkg || typeof pkg !== 'string') {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'Body must include package (string)',
      });
    }
    const pkgName = pkg.trim();
    if (!pkgName) {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'package cannot be empty',
      });
    }

    // Verify the package exists
    const versions = await bundleStorage.getBundleVersions(pkgName);
    if (!versions || versions.length === 0) {
      return reply.code(404).send({
        error: 'not_found',
        message: `Package '${pkgName}' does not exist in the registry`,
      });
    }

    // Verify the requester owns the package.
    const latestManifest = await bundleStorage.getBundleManifest(
      pkgName,
      versions[0]
    );
    if (!manifestOwnedByUser(latestManifest, user)) {
      return reply.code(403).send({
        error: 'forbidden',
        message: `You do not own package '${pkgName}'. Only the package owner can link it to an organization`,
      });
    }

    // SECURITY: setPkg2Org overwrites the link unconditionally, so owning the
    // manifest is NOT enough — a package already linked to another org would
    // otherwise be yanked into the caller's org, silently stripping the real
    // org's admins/owners of control. Refuse re-linking a package owned by a
    // different org unless the caller also administers that current org.
    const currentOrgId = await getPkg2Org(pkgName);
    if (currentOrgId && currentOrgId !== orgId) {
      const controlsCurrent = await isOrgAdminOrOwner(currentOrgId, user.email);
      if (!controlsCurrent) {
        return reply.code(409).send({
          error: 'conflict',
          message: `Package '${pkgName}' is already linked to another organization. Unlink it there first.`,
        });
      }
    }

    await setPkg2Org(pkgName, orgId);
    return reply.code(204).send();
  });

  // DELETE /api/v2/orgs/:orgId/packages/:package — unlink package (admin or owner)
  server.delete(
    '/api/v2/orgs/:orgId/packages/:package',
    async (request, reply) => {
      const { orgId, package: pkg } = request.params;
      const org = await getOrg(orgId);
      if (!org) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'Organization not found',
        });
      }
      const user = await requireOrgAdminOrOwner(request, reply, orgId);
      if (!user) return;
      const currentOrgId = await getPkg2Org(pkg);
      if (currentOrgId !== orgId) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'Package is not linked to this organization',
        });
      }
      await deletePkg2Org(pkg);
      return reply.code(204).send();
    }
  );

  // GET /api/v2/orgs/:orgId/packages — list packages linked to org (public)
  server.get('/api/v2/orgs/:orgId/packages', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const packages = await getPackagesByOrg(orgId);
    return reply.send({ packages });
  });

  // GET /api/v2/orgs/:orgId/members — list members (username + role, public; emails only to their owner or a site admin)
  server.get('/api/v2/orgs/:orgId/members', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const emails = await getOrgMembers(orgId);
    const caller = await resolveOptionalUser(request);
    const callerEmail = caller?.email?.toLowerCase() ?? null;
    const callerIsAdmin = !!callerEmail && (await isAdmin(callerEmail));
    const members = await Promise.all(
      emails.map(async email => {
        const role = await getOrgMemberRole(orgId, email);
        const profile = await getUserByEmail(email);
        return {
          ...(callerIsAdmin || email.toLowerCase() === callerEmail
            ? { email }
            : {}),
          username: profile?.username ?? null,
          verified: profile?.verified ?? email.endsWith('@calimero.network'),
          role: role || 'member',
          isBot: await isBot(email),
        };
      })
    );
    return reply.send({ members });
  });
}

module.exports = orgRoutes;
