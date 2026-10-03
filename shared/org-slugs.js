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

function confusableSkeleton(label) {
  return label
    .replace(/[-_]/g, '')
    .replace(/rn/g, 'm')
    .replace(/0/g, 'o')
    .replace(/[1i]/g, 'l')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a');
}

const CALIMERO_SKELETON = confusableSkeleton(RESERVED_SUBSTRING);

const INVISIBLE_CHARS = /\p{Default_Ignorable_Code_Point}/gu;

function foldLookalikeLetters(text) {
  return text
    .replace(/[\u0430\u03b1]/g, 'a')
    .replace(/[\u0441\u03f2]/g, 'c')
    .replace(/[\u0435\u03b5]/g, 'e')
    .replace(/[\u0456\u03b9\u0131]/g, 'i')
    .replace(/\u04cf/g, 'l')
    .replace(/[\u043c\u03bc]/g, 'm')
    .replace(/[\u043e\u03bf]/g, 'o');
}

function normalizeOrgName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isReservedOrgName(name) {
  const letters = foldLookalikeLetters(
    normalizeOrgName(name)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
  ).replace(/[^a-z0-9]/g, '');
  return confusableSkeleton(letters).includes(CALIMERO_SKELETON);
}

module.exports = {
  isReservedOrgSlug,
  isReservedOrgName,
  normalizeOrgName,
  confusableSkeleton,
  CALIMERO_SKELETON,
};
