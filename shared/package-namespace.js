/**
 * Package namespaces: which part of a reverse-DNS package id an organization
 * owns. Shared by the publish gate (api/lib/package-records.js) and the
 * migration script, so both draw the boundary in the same place.
 *
 *   com.acme.app          -> com.acme        (TLD first label: two labels)
 *   acme.app              -> acme            (brand first label: one label)
 *   io.github.alice.app   -> io.github.alice (code host: three labels)
 */

// First labels that are a TLD, so the namespace is the first TWO labels
// (`com.acme.app` -> `com.acme`). Any other first label is a brand on its own
// (`acme.app` -> `acme`). Two-letter labels are ccTLDs.
const TLD_LABELS = new Set([
  'com',
  'org',
  'net',
  'io',
  'dev',
  'app',
  'ai',
  'co',
  'xyz',
  'network',
  'cloud',
  'tech',
  'me',
  'info',
  'biz',
  'so',
  'gg',
  'sh',
]);
// Code hosts hand out sub-namespaces to unrelated users, so the owner is the
// THIRD label (`io.github.alice.app` -> `io.github.alice`), never the host.
const SHARED_HOSTS = new Set([
  'io.github',
  'com.github',
  'io.gitlab',
  'com.gitlab',
  'org.bitbucket',
  'com.bitbucket',
  'org.codeberg',
]);

/**
 * The namespace a package id belongs to.
 * @param {string} pkg reverse-DNS package id
 */
function namespaceOf(pkg) {
  const labels = String(pkg || '')
    .toLowerCase()
    .split('.');
  if (labels.length < 2) return labels[0] || '';
  const first = labels[0];
  if (!(TLD_LABELS.has(first) || first.length === 2)) return first;
  const two = labels.slice(0, 2).join('.');
  if (SHARED_HOSTS.has(two) && labels.length >= 3) {
    return labels.slice(0, 3).join('.');
  }
  return two;
}

module.exports = { namespaceOf, TLD_LABELS, SHARED_HOSTS };
