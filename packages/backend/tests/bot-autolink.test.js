/**
 * Bot pushes attribute to the bot's org without a separate link call.
 *
 * The interesting cases are the refusals: a human must not be auto-attributed
 * (their token says nothing about which org a package belongs to), and a bot
 * must not capture a package that already belongs to someone else.
 */

const { autolinkBotPackage } = require('../../../shared/bot-autolink');

function makeDeps({ bots = [], users = {}, links = {} } = {}) {
  const botSet = new Set(bots);
  const pkg2org = { ...links };
  return {
    pkg2org,
    deps: {
      isBot: async email => botSet.has(email),
      getUserByEmail: async email => users[email] ?? null,
      getPkg2Org: async pkg => pkg2org[pkg] ?? null,
      setPkg2Org: async (pkg, orgId) => {
        pkg2org[pkg] = orgId;
      },
    },
  };
}

const BOT = 'bot-merostudio@calimero.network';
const HUMAN = 'xabi@calimero.network';
const PKG = 'com.calimero-studio.demo';

describe('autolinkBotPackage', () => {
  it('links a new package to the org that owns the bot', async () => {
    const { deps, pkg2org } = makeDeps({
      bots: [BOT],
      users: { [BOT]: { botOrg: 'calimero-network' } },
    });
    expect(await autolinkBotPackage(deps, BOT, PKG)).toBe('calimero-network');
    expect(pkg2org[PKG]).toBe('calimero-network');
  });

  it('leaves human pushes unattributed', async () => {
    const { deps, pkg2org } = makeDeps({
      bots: [BOT],
      users: { [HUMAN]: { botOrg: 'calimero-network' } },
    });
    expect(await autolinkBotPackage(deps, HUMAN, PKG)).toBeNull();
    expect(pkg2org[PKG]).toBeUndefined();
  });

  it('refuses to move a package that already belongs to another org', async () => {
    const { deps, pkg2org } = makeDeps({
      bots: [BOT],
      users: { [BOT]: { botOrg: 'calimero-network' } },
      links: { [PKG]: 'someone-else' },
    });
    expect(await autolinkBotPackage(deps, BOT, PKG)).toBeNull();
    expect(pkg2org[PKG]).toBe('someone-else');
  });

  it('is a no-op for a bot with no botOrg recorded', async () => {
    const { deps, pkg2org } = makeDeps({
      bots: [BOT],
      users: { [BOT]: {} },
    });
    expect(await autolinkBotPackage(deps, BOT, PKG)).toBeNull();
    expect(pkg2org[PKG]).toBeUndefined();
  });

  it('is a no-op for anonymous pushes', async () => {
    const { deps } = makeDeps({ bots: [BOT] });
    expect(await autolinkBotPackage(deps, null, PKG)).toBeNull();
    expect(await autolinkBotPackage(deps, BOT, null)).toBeNull();
  });

  it('re-linking the same package to the same bot org stays put', async () => {
    const { deps, pkg2org } = makeDeps({
      bots: [BOT],
      users: { [BOT]: { botOrg: 'calimero-network' } },
      links: { [PKG]: 'calimero-network' },
    });
    // Already linked, so the guard short-circuits rather than rewriting.
    expect(await autolinkBotPackage(deps, BOT, PKG)).toBeNull();
    expect(pkg2org[PKG]).toBe('calimero-network');
  });
});
