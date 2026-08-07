/**
 * Attribute a bot's push to the org that owns the bot.
 * Used by both the Vercel serverless API and Fastify backend.
 */

/**
 * A bot exists for exactly one org, so there is no ambiguity to resolve and no
 * reason to make a human link the package afterwards. Humans are left alone:
 * their token says nothing about which org a given package belongs to.
 *
 * @returns {Promise<string|null>} the org the package was linked to, or null
 */
async function autolinkBotPackage(deps, email, packageName) {
  const { isBot, getUserByEmail, getPkg2Org, setPkg2Org } = deps;
  if (!email || !packageName) return null;
  if (!(await isBot(email))) return null;

  const profile = await getUserByEmail(email);
  const orgId = profile?.botOrg;
  if (!orgId) return null;

  // Never move a package that already belongs somewhere, so a bot cannot
  // capture another org's package by pushing a version of it.
  if (await getPkg2Org(packageName)) return null;

  await setPkg2Org(packageName, orgId);
  return orgId;
}

module.exports = { autolinkBotPackage };
