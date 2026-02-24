/**
 * NPM-style organization API: CRUD orgs, members (pubkeys), package↔org link.
 * Write routes require X-Pubkey + X-Signature (signed request); admin check for org-scoped writes.
 */

const canonicalize = require('canonicalize');
const {
  getOrg,
  setOrg,
  getOrgIdBySlug,
  getOrgBySlug,
  getOrgMembers,
  addOrgMember,
  removeOrgMember,
  getOrgMemberRole,
  isOrgAdmin,
  getOrgsByMember,
  getPkg2Org,
  setPkg2Org,
  deletePkg2Org,
  getPackagesByOrg,
} = require('../lib/org-storage');
const { verifySignature, validatePublicKey } = require('../lib/verify');

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

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
 * Get pubkey from request: X-Pubkey header. Returns null if missing.
 */
function getPubkeyFromRequest(request) {
  const pubkey = request.headers['x-pubkey'];
  return typeof pubkey === 'string' && pubkey.trim() ? pubkey.trim() : null;
}

/**
 * Verify signed request. Returns { pubkey } or throws reply with 401.
 * Expects X-Pubkey and X-Signature headers; body is request.body (parsed).
 */
async function requireSignedRequest(request, reply) {
  const pubkey = getPubkeyFromRequest(request);
  const signature = request.headers['x-signature'];
  if (!pubkey || !signature) {
    return reply.code(401).send({
      error: 'unauthorized',
      message: 'X-Pubkey and X-Signature required for this operation',
    });
  }
  if (!validatePublicKey(pubkey)) {
    return reply.code(400).send({
      error: 'invalid_pubkey',
      message: 'X-Pubkey is not a valid public key',
    });
  }
  const pathname = request.url.split('?')[0];
  const payload = buildSignedPayload(
    request.method,
    pathname,
    request.body || {}
  );
  const valid = await verifySignature(pubkey, signature, payload);
  if (!valid) {
    return reply.code(401).send({
      error: 'invalid_signature',
      message: 'X-Signature verification failed',
    });
  }
  return { pubkey };
}

/**
 * Require that the request is signed and the pubkey is admin of orgId.
 * Returns { pubkey } or sends error response.
 */
async function requireOrgAdmin(request, reply, orgId) {
  const result = await requireSignedRequest(request, reply);
  if (result.pubkey === undefined) return null; // reply already sent
  const admin = await isOrgAdmin(orgId, result.pubkey);
  if (!admin) {
    return reply.code(403).send({
      error: 'forbidden',
      message: 'Only an organization admin can perform this action',
    });
  }
  return result;
}

async function orgRoutes(server) {
  // GET /api/v2/orgs?member=<pubkey> — list orgs the member belongs to (no auth)
  server.get('/api/v2/orgs', async (request, reply) => {
    const member = request.query?.member;
    if (!member || typeof member !== 'string') {
      return reply.send([]);
    }
    const pubkey = member.trim();
    if (!validatePublicKey(pubkey)) {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'Query member must be a valid public key',
      });
    }
    const orgs = await getOrgsByMember(pubkey);
    return reply.send(orgs);
  });

  // POST /api/v2/orgs — create org (signed request; creating key becomes first admin)
  server.post('/api/v2/orgs', async (request, reply) => {
    const result = await requireSignedRequest(request, reply);
    if (result.pubkey === undefined) return;
    const { name, slug } = request.body || {};
    if (!name || typeof name !== 'string' || !slug || typeof slug !== 'string') {
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
    await addOrgMember(orgId, result.pubkey, 'admin');
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

  // PATCH /api/v2/orgs/:orgId — update org (admin only)
  server.patch('/api/v2/orgs/:orgId', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    await requireOrgAdmin(request, reply, orgId);
    if (reply.sent) return;
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

  // POST /api/v2/orgs/:orgId/members — add member (admin only)
  server.post('/api/v2/orgs/:orgId/members', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    await requireOrgAdmin(request, reply, orgId);
    if (reply.sent) return;
    const { pubkey, role } = request.body || {};
    if (!pubkey || typeof pubkey !== 'string') {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'Body must include pubkey (string)',
      });
    }
    const pk = pubkey.trim();
    if (!validatePublicKey(pk)) {
      return reply.code(400).send({
        error: 'bad_request',
        message: 'pubkey is not a valid public key',
      });
    }
    await addOrgMember(orgId, pk, role === 'admin' ? 'admin' : 'member');
    return reply.code(204).send();
  });

  // DELETE /api/v2/orgs/:orgId/members/:pubkey — remove member (admin only)
  server.delete(
    '/api/v2/orgs/:orgId/members/:pubkey',
    async (request, reply) => {
      const { orgId, pubkey } = request.params;
      const org = await getOrg(orgId);
      if (!org) {
        return reply.code(404).send({
          error: 'not_found',
          message: 'Organization not found',
        });
      }
      await requireOrgAdmin(request, reply, orgId);
      if (reply.sent) return;
      await removeOrgMember(orgId, pubkey);
      return reply.code(204).send();
    }
  );

  // POST /api/v2/orgs/:orgId/packages — link package to org (admin only)
  server.post('/api/v2/orgs/:orgId/packages', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    await requireOrgAdmin(request, reply, orgId);
    if (reply.sent) return;
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
    await setPkg2Org(pkgName, orgId);
    return reply.code(204).send();
  });

  // DELETE /api/v2/orgs/:orgId/packages/:package — unlink package (admin only)
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
      await requireOrgAdmin(request, reply, orgId);
      if (reply.sent) return;
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

  // GET /api/v2/orgs/:orgId/members — list members (optional: require member or public)
  server.get('/api/v2/orgs/:orgId/members', async (request, reply) => {
    const { orgId } = request.params;
    const org = await getOrg(orgId);
    if (!org) {
      return reply.code(404).send({
        error: 'not_found',
        message: 'Organization not found',
      });
    }
    const pubkeys = await getOrgMembers(orgId);
    const roles = {};
    for (const pk of pubkeys) {
      const role = await getOrgMemberRole(orgId, pk);
      roles[pk] = role || 'member';
    }
    return reply.send({
      members: pubkeys.map(pk => ({ pubkey: pk, role: roles[pk] })),
    });
  });
}

module.exports = orgRoutes;
