/**
 * NPM-style organization API: CRUD orgs, members (emails), package↔org link.
 * Write routes require Google OAuth session cookie or Authorization: Bearer <api-token>.
 * Admin-gated writes additionally check org membership role.
 */

const {
  getOrg,
  setOrg,
  getOrgIdBySlug,
  getOrgMembers,
  addOrgMember,
  removeOrgMember,
  getOrgMemberRole,
  updateOrgMemberRole,
  isOrgOwner,
  isOrgAdminOrOwner,
  getOrgsByMember,
  getPkg2Org,
  setPkg2Org,
  deletePkg2Org,
  getPackagesByOrg,
  deleteOrg,
} = require('../lib/org-storage');
const { verifySessionToken, verifyApiToken } = require('../lib/auth');
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
 * Resolve the current user from session cookie or Bearer token.
 * Returns { email, name } or sends 401 and returns null.
 */
async function requireAuth(request, reply) {
  // Try session cookie
  const sessionUser = await getSessionUser(request);
  if (sessionUser?.email)
    return { email: sessionUser.email, name: sessionUser.name };

  // Try Bearer token
  const auth = request.headers?.['authorization'];
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const tokenData = await verifyApiToken(auth.slice(7));
    if (tokenData?.email)
      return { email: tokenData.email, name: tokenData.name };
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

async function orgRoutes(server) {
  // GET /api/v2/orgs?member=<email> — list orgs the member belongs to (no auth)
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
    const slugNorm = slug.toLowerCase().trim();
    if (!SLUG_REGEX.test(slugNorm)) {
      return reply.code(400).send({
        error: 'bad_request',
        message:
          'slug must be lowercase alphanumeric and hyphens (e.g. my-org)',
      });
    }
    const existingId = await getOrgIdBySlug(slugNorm);
    if (existingId) {
      return reply.code(409).send({
        error: 'conflict',
        message: 'An organization with this slug already exists',
      });
    }
    const orgId = slugNorm;
    const org = {
      id: orgId,
      name: name.trim(),
      slug: slugNorm,
    };
    await setOrg(org);
    await addOrgMember(orgId, user.email, 'owner');
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
    if (typeof name === 'string') updates.name = name.trim();
    if (metadata !== undefined && typeof metadata === 'object')
      updates.metadata = metadata;
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
    return reply.code(204).send();
  });

  // POST /api/v2/orgs/:orgId/members — add member by email (owner can add admin; admin/owner can add member)
  server.post('/api/v2/orgs/:orgId/members', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const { email, role } = request.body || {};
    if (!email || typeof email !== 'string') {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'Body must include email (string)',
      });
    }
    const memberEmail = email.trim();
    if (!isValidEmail(memberEmail)) {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'email is not a valid email address',
      });
    }
    const roleNorm = role === 'admin' ? 'admin' : 'member';
    if (roleNorm === 'admin') {
      const user = await requireOrgOwner(request, reply, orgId);
      if (!user) return;
    } else {
      const user = await requireOrgAdminOrOwner(request, reply, orgId);
      if (!user) return;
    }
    await addOrgMember(orgId, memberEmail, roleNorm);
    return reply.code(204).send();
  });

  // PATCH /api/v2/orgs/:orgId/members/:email — update member role (owner only; promote/demote admin/member)
  server.patch('/api/v2/orgs/:orgId/members/:email', async (request, reply) => {
    const { orgId, email: memberEmail } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const user = await requireOrgOwner(request, reply, orgId);
    if (!user) return;
    const { role } = request.body || {};
    if (role !== 'admin' && role !== 'member') {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'role must be "admin" or "member"',
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

  // DELETE /api/v2/orgs/:orgId/members/:email — remove member (admin or owner)
  server.delete(
    '/api/v2/orgs/:orgId/members/:email',
    async (request, reply) => {
      const { orgId, email: memberEmail } = request.params;
      const org = await getOrg(orgId);
      if (!org) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'Organization not found',
        });
      }
      const user = await requireOrgAdminOrOwner(request, reply, orgId);
      if (!user) return;
      const targetRole = await getOrgMemberRole(orgId, memberEmail);
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

    // Verify the requester owns the package (session/token email must match metadata.author)
    const latestManifest = await bundleStorage.getBundleManifest(
      pkgName,
      versions[0]
    );
    const packageAuthor = latestManifest?.metadata?.author;
    if (!packageAuthor || packageAuthor !== user.email) {
      return reply.code(403).send({
        error: 'forbidden',
        message: `You do not own package '${pkgName}'. Only the package author can link it to an organization`,
      });
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

  // GET /api/v2/orgs/:orgId/members — list members (email + role, public)
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
    const roles = {};
    for (const email of emails) {
      const role = await getOrgMemberRole(orgId, email);
      roles[email] = role || 'member';
    }
    return reply.send({
      members: emails.map(email => ({ email, role: roles[email] })),
    });
  });
}

module.exports = orgRoutes;
