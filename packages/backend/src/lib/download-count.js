const crypto = require('crypto');
const net = require('net');

const DEDUPE_TTL_SECONDS = 3600;

// One host usually holds a whole IPv6 /64, so counting each address would let it inflate counts.
function clientNetwork(ip) {
  const bare = ip.split('%')[0];
  if (!net.isIPv6(bare)) return bare;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(bare);
  if (mapped) return mapped[1];
  const [head, tail = ''] = bare.split('::');
  const groups = part => (part ? part.split(':') : []);
  const known = groups(head);
  const missing = 8 - known.length - groups(tail).length;
  return [...known, ...Array(Math.max(missing, 0)).fill('0'), ...groups(tail)]
    .slice(0, 4)
    .map(group => parseInt(group, 16).toString(16))
    .join(':');
}

function dedupeKey(ip, pkg) {
  // Hash the client address so raw IPs are never stored.
  const client = crypto
    .createHash('sha256')
    .update(clientNetwork(ip))
    .digest('hex')
    .slice(0, 32);
  return `download-seen:${client}:${pkg}`;
}

// Counts a client at most once per package per hour, whatever the version.
async function countDownload(kv, ip, pkg) {
  const firstSeen = await kv.setNXEx(
    dedupeKey(ip, pkg),
    '1',
    DEDUPE_TTL_SECONDS
  );
  if (firstSeen) {
    await kv.incr('downloads:total');
    await kv.incr(`downloads:${pkg}`);
  }
  return firstSeen;
}

module.exports = { clientNetwork, dedupeKey, countDownload };
