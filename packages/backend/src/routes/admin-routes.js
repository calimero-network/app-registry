/**
 * Admin routes for local Fastify dev server.
 * Mirrors the Vercel api/admin/* serverless functions.
 */

const { kv } = require('../lib/kv-client');
const {
  isAdmin,
  isBlacklisted,
  addAdmin,
  removeAdmin,
  blacklistUser,
  unblacklistUser,
  setAdminVerified,
  getAdminVerified,
  listAdminEmails,
  listBlacklistedEmails,
} = require('../lib/admin-storage');
const {
  getOrg,
  setOrg,
  deleteOrg,
  getOrgMembers,
  getPackagesByOrg,
} = require('../lib/org-storage');
const { resolveUser } = require('../lib/resolve-user');
const { getUserById, getUserByEmail } = require('../lib/user-storage');
const semver = require('semver');

async function adminRoutes(server, options) {
  const { sessionSecret, cookieName } = options.config.auth;
  const resolveOpts = { cookieName, sessionSecret };

  async function requireAdmin(request, reply) {
    const user = await resolveUser(request, resolveOpts);
    if (!user) {
      reply
        .code(401)
        .send({ error: 'unauthorized', message: 'Login required' });
      return null;
    }
    if (!(await isAdmin(user.email))) {
      reply
        .code(403)
        .send({ error: 'forbidden', message: 'Admin access required' });
      return null;
    }
    return user;
  }

  // GET /api/admin/check
  server.get('/api/admin/check', async (request, reply) => {
    const user = await resolveUser(request, resolveOpts);
    if (!user) return reply.code(401).send({ error: 'unauthorized' });
    return { isAdmin: await isAdmin(user.email) };
  });

  // GET /api/admin/users/lookup?email=... — find a single user by email
  server.get('/api/admin/users/lookup', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { email } = request.query || {};
    if (!email)
      return reply.code(400).send({ error: 'email query param required' });
    const user = await getUserByEmail(email.toLowerCase());
    if (!user) return reply.code(404).send({ error: 'not_found' });
    const adminVerified = await getAdminVerified('user', user.id);
    return {
      id: user.id,
      email: user.email,
      username: user.username || null,
      name: user.name || null,
      verified: user.verified || adminVerified,
      adminVerified,
      isAdmin: await isAdmin(user.email),
      isBlacklisted: await isBlacklisted(user.email),
      createdAt: user.createdAt || null,
    };
  });

  // GET /api/admin/users
  server.get('/api/admin/users', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const keys = await kv.scanKeys('user:*');
    const [adminEmails, blacklistedEmails] = await Promise.all([
      listAdminEmails(),
      listBlacklistedEmails(),
    ]);
    const adminSet = new Set(adminEmails.map(e => e.toLowerCase()));
    const blacklistSet = new Set(blacklistedEmails.map(e => e.toLowerCase()));
    const users = [];
    for (const key of keys) {
      const keyStr =
        typeof key === 'string'
          ? key
          : Buffer.isBuffer(key)
            ? key.toString('utf8')
            : String(key);
      const raw = await kv.get(keyStr);
      if (!raw) continue;
      try {
        const user = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        if (!user.email) continue;
        const userIdForVerified = String(
          user.id ?? keyStr.replace(/^user:/, '')
        );
        const adminVerified = await getAdminVerified('user', userIdForVerified);
        users.push({
          id: user.id,
          email: user.email,
          username: user.username || null,
          name: user.name || null,
          verified: user.verified || adminVerified,
          adminVerified,
          isAdmin:
            user.email.endsWith('@calimero.network') ||
            adminSet.has(user.email.toLowerCase()),
          isBlacklisted: blacklistSet.has(user.email.toLowerCase()),
          createdAt: user.createdAt || null,
        });
      } catch {
        /* skip */
      }
    }
    users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));
    return { users };
  });

  // DELETE /api/admin/users/:userId — PATCH /api/admin/users/:userId
  server.delete('/api/admin/users/:userId', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { userId } = request.params;
    const raw = await kv.get(`user:${userId}`);
    if (!raw) return reply.code(404).send({ error: 'not_found' });
    const user = JSON.parse(raw);
    if (user.email) await removeAdmin(user.email);
    await setAdminVerified('user', userId, false);
    await kv.del(`user:${userId}`);
    if (user.email) await kv.del(`email2user:${user.email.toLowerCase()}`);
    if (user.username) await kv.del(`username:${user.username.toLowerCase()}`);
    return reply.code(204).send();
  });

  server.patch('/api/admin/users/:userId', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { userId } = request.params;
    const raw = await kv.get(`user:${userId}`);
    if (!raw) return reply.code(404).send({ error: 'not_found' });
    const user = JSON.parse(raw);
    // Enrich with latest profile data (getUserById is the canonical lookup)
    const profile = await getUserById(userId);
    if (profile) {
      user.username = profile.username || user.username;
      user.name = profile.name || user.name;
    }
    const { action, reason } = request.body || {};
    const email = user.email;
    if (
      !email &&
      ['make_admin', 'remove_admin', 'blacklist', 'unblacklist'].includes(
        action
      )
    ) {
      return reply.code(400).send({ error: 'no_email' });
    }
    switch (action) {
      case 'verify':
        await setAdminVerified('user', userId, true);
        user.verified = true;
        await kv.set(`user:${userId}`, JSON.stringify(user));
        return { ok: true };
      case 'unverify':
        await setAdminVerified('user', userId, false);
        if (email && !email.endsWith('@calimero.network')) {
          user.verified = false;
          await kv.set(`user:${userId}`, JSON.stringify(user));
        }
        return { ok: true };
      case 'make_admin':
        await addAdmin(email);
        return { ok: true };
      case 'remove_admin':
        if (email.endsWith('@calimero.network'))
          return reply.code(400).send({
            error: 'cannot_remove',
            message: 'Cannot remove admin from @calimero.network accounts',
          });
        await removeAdmin(email);
        return { ok: true };
      case 'blacklist':
        if (email.endsWith('@calimero.network'))
          return reply.code(400).send({
            error: 'cannot_blacklist',
            message: 'Cannot blacklist @calimero.network accounts',
          });
        await blacklistUser(email, reason, admin.email);
        return { ok: true };
      case 'unblacklist':
        await unblacklistUser(email);
        return { ok: true };
      default:
        return reply.code(400).send({ error: 'bad_action' });
    }
  });

  // GET /api/admin/packages
  server.get('/api/admin/packages', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const allPackages = await kv.sMembers('bundles:all');
    const packages = [];
    for (const packageName of allPackages) {
      const versions = await kv.sMembers(`bundle-versions:${packageName}`);
      if (!versions.length) continue;
      const sorted = versions.sort((a, b) =>
        semver.rcompare(semver.valid(a) || '0.0.0', semver.valid(b) || '0.0.0')
      );
      const data = await kv.get(`bundle:${packageName}/${sorted[0]}`);
      if (!data) continue;
      const bundle = JSON.parse(data).json;
      const adminVerified = await getAdminVerified('package', packageName);
      const ownerEmail = (
        bundle.metadata?._ownerEmail ||
        bundle.metadata?.author ||
        ''
      ).toLowerCase();
      const downloads = parseInt(
        (await kv.get(`downloads:${packageName.toLowerCase()}`)) || '0',
        10
      );
      packages.push({
        name: packageName,
        latestVersion: sorted[0],
        versionCount: versions.length,
        author: bundle.metadata?.author || '',
        verified: adminVerified || ownerEmail.endsWith('@calimero.network'),
        adminVerified,
        downloads,
      });
    }
    packages.sort((a, b) => a.name.localeCompare(b.name));
    return { packages };
  });

  // DELETE /api/admin/packages/:packageName — PATCH /api/admin/packages/:packageName
  server.delete('/api/admin/packages/:packageName', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { packageName } = request.params;
    const versions = await kv.sMembers(`bundle-versions:${packageName}`);
    for (const v of versions) await kv.del(`bundle:${packageName}/${v}`);
    await kv.del(`bundle-versions:${packageName}`);
    await kv.sRem('bundles:all', packageName);
    await kv.del(`downloads:${packageName.toLowerCase()}`);
    await setAdminVerified('package', packageName, false);
    return reply.code(204).send();
  });

  server.patch('/api/admin/packages/:packageName', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { packageName } = request.params;
    const { action, version } = request.body || {};

    if (action === 'delete_version') {
      if (!version) return reply.code(400).send({ error: 'version required' });
      await kv.del(`bundle:${packageName}/${version}`);
      await kv.sRem(`bundle-versions:${packageName}`, version);
      const remaining = await kv.sMembers(`bundle-versions:${packageName}`);
      if (!remaining.length) {
        await kv.sRem('bundles:all', packageName);
        await kv.del(`downloads:${packageName.toLowerCase()}`);
      }
      return { ok: true };
    }

    const versions = await kv.sMembers(`bundle-versions:${packageName}`);
    const latest = versions.length
      ? versions.sort((a, b) =>
          semver.rcompare(
            semver.valid(a) || '0.0.0',
            semver.valid(b) || '0.0.0'
          )
        )[0]
      : null;

    if (action === 'verify') {
      await setAdminVerified('package', packageName, true);
      if (latest) {
        const raw = await kv.get(`bundle:${packageName}/${latest}`);
        if (raw) {
          const stored = JSON.parse(raw);
          stored.json.metadata = stored.json.metadata || {};
          stored.json.metadata._adminVerified = true;
          await kv.set(
            `bundle:${packageName}/${latest}`,
            JSON.stringify(stored)
          );
        }
      }
      return { ok: true };
    }
    if (action === 'unverify') {
      await setAdminVerified('package', packageName, false);
      if (latest) {
        const raw = await kv.get(`bundle:${packageName}/${latest}`);
        if (raw) {
          const stored = JSON.parse(raw);
          if (stored.json.metadata) delete stored.json.metadata._adminVerified;
          await kv.set(
            `bundle:${packageName}/${latest}`,
            JSON.stringify(stored)
          );
        }
      }
      return { ok: true };
    }
    return reply.code(400).send({ error: 'bad_action' });
  });

  // GET /api/admin/orgs
  server.get('/api/admin/orgs', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const keys = await kv.scanKeys('org:*');
    const orgs = [];
    for (const key of keys) {
      const keyStr =
        typeof key === 'string'
          ? key
          : Buffer.isBuffer(key)
            ? key.toString('utf8')
            : String(key);
      if (
        keyStr.endsWith(':members') ||
        keyStr.endsWith(':roles') ||
        keyStr.endsWith(':packages') ||
        keyStr.startsWith('org:by_slug:')
      )
        continue;
      const raw = await kv.get(keyStr);
      if (!raw) continue;
      try {
        const org = JSON.parse(typeof raw === 'string' ? raw : String(raw));
        if (!org.id || !org.name) continue;
        const adminVerified = await getAdminVerified('org', org.id);
        orgs.push({
          id: org.id,
          name: org.name,
          slug: org.slug,
          verified: org.verified || adminVerified,
          adminVerified,
          createdAt: org.created_at || null,
          metadata: org.metadata || null,
        });
      } catch {
        /* skip */
      }
    }
    orgs.sort((a, b) => a.name.localeCompare(b.name));
    return { orgs };
  });

  // DELETE /api/admin/orgs/:orgId — PATCH /api/admin/orgs/:orgId
  server.delete('/api/admin/orgs/:orgId', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { orgId } = request.params;
    await deleteOrg(orgId);
    await setAdminVerified('org', orgId, false);
    return reply.code(204).send();
  });

  server.patch('/api/admin/orgs/:orgId', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const { orgId } = request.params;
    const { action } = request.body || {};
    if (action === 'verify') {
      await setAdminVerified('org', orgId, true);
      const org = await getOrg(orgId);
      if (org) await setOrg({ ...org, verified: true });
      return { ok: true };
    }
    if (action === 'unverify') {
      await setAdminVerified('org', orgId, false);
      const org = await getOrg(orgId);
      if (org) await setOrg({ ...org, verified: false });
      return { ok: true };
    }
    return reply.code(400).send({ error: 'bad_action' });
  });

  // GET /api/admin/orgs/:orgId/members — list org members
  server.get('/api/admin/orgs/:orgId/members', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const members = await getOrgMembers(request.params.orgId);
    return { members: members || [] };
  });

  // GET /api/admin/orgs/:orgId/packages — list packages linked to an org
  server.get('/api/admin/orgs/:orgId/packages', async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const packages = await getPackagesByOrg(request.params.orgId);
    return { packages: packages || [] };
  });
}

module.exports = adminRoutes;
