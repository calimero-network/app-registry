/**
 * Organisation slugs that only a site admin may claim.
 *
 * An org's slug is how people recognise who publishes a package, and the
 * trusted-publisher shortcut in `package-review.js` keys on it. A slug that
 * names Calimero must therefore be one Calimero created: anything containing
 * "calimero" is reserved, so a look-alike (`calimero-apps`, `thecalimero`) is
 * refused along with the exact name.
 *
 * ⚠️ RESERVED IS NOT TRUSTED. Reserving a slug only decides who may create it;
 * whether its packages skip review is `TRUSTED_ORG_SLUGS`, a separate and much
 * shorter list.
 */
const RESERVED_SUBSTRING = 'calimero';

function isReservedOrgSlug(slug) {
  return String(slug || '')
    .toLowerCase()
    .includes(RESERVED_SUBSTRING);
}

module.exports = { isReservedOrgSlug };
