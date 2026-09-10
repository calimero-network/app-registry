'use strict';

/**
 * Upload-time metadata policy: what a bundle must carry to be listed.
 *
 * WHY THIS EXISTS
 *
 * The fleet already checks its own metadata — `apps/scripts/check-app-icons.py`
 * and `check-app-metadata.sh` run in the `apps` monorepo's CI. But those are
 * *fleet-side*: anything published from outside that repo walks straight past
 * them. The registry itself enforced exactly two things — a signature, and that
 * a new version is greater than the last — so a bundle with no icon, no
 * category and a placeholder runtime floor published cleanly and then looked
 * broken in the listing and in the desktop launcher.
 *
 * That is not hypothetical: `com.calimero.mero-drive-migration-test` is in the
 * production registry with no icon, no slug, `minRuntimeVersion: 0.1.0`, and
 * `verified: true`.
 *
 * ONE VALIDATOR, THREE UPLOAD PATHS. The CLI (`/api/v2/bundles/push`), an API
 * key (same route) and the web upload form (`/api/v2/bundles/push-file`) all
 * funnel through `processPushBody` in server.js. Validating there — beside the
 * existing version check — is what makes the three paths agree. Do not add a
 * second copy of these rules to the frontend: the upload page renders whatever
 * `{error, message}` the backend returns, so it inherits this for free.
 *
 * GRANDFATHERING. A brand-new package must be complete. An existing package
 * still publishes, and gets `warnings` describing what it is missing. Two live
 * apps (`mero-ar`, `mero-tag`) ship no icon today; hard-failing them would break
 * their release path the moment this deploys, to fix data that is already
 * published. New packages carry the standard from day one.
 */

const crypto = require('crypto');

/**
 * The controlled category vocabulary. Exactly one per app, Apple-style: a
 * primary category is what a storefront can browse by, and free-form tags are
 * what it can search by. Both exist here — `category` is required and closed,
 * `tags` stay open.
 *
 * Ten, and every one is populated by at least one app published as of
 * 2026-09-10 — the comments name them. That is the bar for adding an eleventh:
 * every value here becomes a browse surface in the registry and in the desktop
 * launcher, so a category no app is in is an empty shelf.
 */
const CATEGORIES = Object.freeze([
  'games', // battleships, merraria, mero-blocks
  'productivity', // mero-sheets, mero-issue-tracker, mero-drive-docs
  'communication', // mero-chat, mero-meet
  'social', // mero-forum
  'art-design', // mero-design, mero-pixart
  'media', // mero-stream, mero-ar
  'planning', // mero-calendar
  'security', // mero-pass, mero-sign
  'utilities', // mero-tag
  'developer-tools', // kv-store, scaffolding-e2e
]);

/**
 * cargo-mero's bundled placeholder mark, by content hash.
 *
 * `icon = "default"` is NOT "no icon" — it is a sentinel selecting a generic
 * Calimero mark that every app setting it publishes identically
 * (`core/tools/cargo-mero/assets/default-icon.png`). Checking that the `icon`
 * field is non-empty therefore proves nothing; two apps shipped this same mark
 * for months with their real icons sitting unused in `app/public/`.
 *
 * Pinned by hash rather than by byte length so a re-encode of the same art is
 * still caught, and so this fails loudly if cargo-mero ever changes the asset.
 */
const PLACEHOLDER_ICON_SHA256 =
  '46eb3850c27882edfce83e0f9c944744836ec3ce9ffc71a2717405afdafe0f31';

/**
 * The registry icon is the source for the macOS `.app` bundle that
 * `tauri-app`'s `ensure_app_launcher_icon` writes into ~/Applications, and for
 * the desktop launcher tile. Anything smaller than this gets upscaled into the
 * Dock next to icons that were not.
 */
const MIN_ICON_DIM = 512;

/** Guard against a multi-megabyte PNG being inlined into every listing response. */
const MAX_ICON_BYTES = 512 * 1024;

const DESCRIPTION_MIN = 20;
const DESCRIPTION_MAX = 4000;
const NAME_MAX = 64;

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Decode a `data:` URI into its raw bytes, or null when the value is not one.
 * Icons reach the registry inline (cargo-mero base64s the file into
 * `metadata.icon`), not as a URL.
 */
function decodeDataUri(value) {
  if (typeof value !== 'string') return null;
  const match = /^data:([^;,]+);base64,(.+)$/s.exec(value.trim());
  if (!match) return null;
  try {
    return {
      mediaType: match[1].toLowerCase(),
      bytes: Buffer.from(match[2], 'base64'),
    };
  } catch {
    return null;
  }
}

/**
 * (width, height) from a PNG's IHDR, or null when the buffer is not a PNG.
 *
 * Only the header is read. The fleet's `check-app-icons.py` goes further and
 * unfilters the image to check that the corners are opaque — corners cut twice
 * look notched once the OS masks them again — but that decodes the whole image,
 * which does not belong on a request path. That check stays in CI; this one
 * catches the cases that make the listing visibly wrong.
 */
function pngDimensions(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * Every problem with an icon, as human-readable sentences. Empty means good.
 * Returns problems rather than throwing so a caller can report all of them at
 * once — a publisher fixing one field at a time per round-trip is why upload
 * flows feel hostile.
 */
function iconProblems(
  icon,
  { placeholderHashes = [PLACEHOLDER_ICON_SHA256] } = {}
) {
  if (icon === undefined || icon === null || icon === '') {
    return ['`metadata.icon` is missing.'];
  }
  const decoded = decodeDataUri(icon);
  if (!decoded) {
    return [
      '`metadata.icon` is not an inline data URI. Expected `data:image/png;base64,...` — cargo-mero produces this from the `icon` path in [package.metadata.calimero].',
    ];
  }
  const { mediaType, bytes } = decoded;
  const problems = [];

  if (mediaType !== 'image/png') {
    problems.push(`\`metadata.icon\` is ${mediaType}; PNG is required.`);
  }
  if (bytes.length > MAX_ICON_BYTES) {
    problems.push(
      `\`metadata.icon\` is ${bytes.length} bytes; the limit is ${MAX_ICON_BYTES}. It is inlined into every listing response.`
    );
  }

  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  if (placeholderHashes.includes(hash)) {
    problems.push(
      '`metadata.icon` is cargo-mero\'s placeholder mark (`icon = "default"`), not an icon for this app. Point `icon` at a real PNG in [package.metadata.calimero].'
    );
    // No point also complaining about its dimensions.
    return problems;
  }

  const dims = pngDimensions(bytes);
  if (!dims) {
    problems.push('`metadata.icon` does not decode as a PNG.');
    return problems;
  }
  if (dims.width !== dims.height) {
    problems.push(
      `\`metadata.icon\` is ${dims.width}x${dims.height}; it must be square. It is masked into a rounded tile downstream.`
    );
  }
  if (dims.width < MIN_ICON_DIM || dims.height < MIN_ICON_DIM) {
    problems.push(
      `\`metadata.icon\` is ${dims.width}x${dims.height}; at least ${MIN_ICON_DIM}x${MIN_ICON_DIM} is required. It is the source for the desktop launcher icon.`
    );
  }
  return problems;
}

/**
 * The app's primary category.
 *
 * TRANSITION PATH. `category` cannot travel in the bundle until cargo-mero
 * learns the field — its `[package.metadata.calimero]` reader is
 * `#[serde(deny_unknown_fields)]`, so writing `category = "games"` today is a
 * build error, which means no publisher could satisfy a hard requirement even
 * if we wrote one. Until that ships, a `tags` entry that happens to name a
 * category is accepted as the category. Remove the fallback once cargo-mero
 * emits `metadata.category` and the fleet has republished.
 */
/**
 * Tag spellings that unambiguously mean a category. Deliberately tiny: it
 * covers singular/plural only. Three apps tag themselves `game` while the
 * category is `games`, and inferring that is safe. Inferring a category from
 * `collaboration` (7 apps, spanning productivity AND communication) or
 * `documents` would be guessing at someone's categorisation, so those still
 * need an explicit `category`.
 */
const TAG_ALIASES = Object.freeze({
  game: 'games',
  'developer-tool': 'developer-tools',
  utility: 'utilities',
});

function resolveCategory(metadata) {
  const declared = metadata?.category;
  if (typeof declared === 'string' && declared.trim()) {
    return { value: declared.trim().toLowerCase(), source: 'category' };
  }
  const tags = Array.isArray(metadata?.tags) ? metadata.tags : [];
  const fromTag = tags
    .map(t => (typeof t === 'string' ? t.trim().toLowerCase() : ''))
    .map(t => TAG_ALIASES[t] || t)
    .find(t => CATEGORIES.includes(t));
  if (fromTag) return { value: fromTag, source: 'tags' };
  return { value: null, source: null };
}

/**
 * Validate a bundle manifest against the publishing policy.
 *
 * @param {object} manifest    the incoming bundle manifest
 * @param {object} opts
 * @param {boolean} opts.isNewPackage  true when no version of this package
 *                                     exists yet; drives grandfathering
 * @returns {{errors: string[], warnings: string[], category: string|null}}
 *   `errors` block the publish; `warnings` are returned alongside a successful
 *   one so an existing package learns what it still owes.
 */
function validateBundleMetadata(manifest, { isNewPackage } = {}) {
  const problems = [];
  const metadata = manifest?.metadata || {};

  const name = typeof metadata.name === 'string' ? metadata.name.trim() : '';
  if (!name) {
    problems.push(
      '`metadata.name` is missing — the title shown in the registry and the launcher.'
    );
  } else if (name.length > NAME_MAX) {
    problems.push(
      `\`metadata.name\` is ${name.length} characters; the limit is ${NAME_MAX}.`
    );
  }

  const description =
    typeof metadata.description === 'string' ? metadata.description.trim() : '';
  if (!description) {
    problems.push('`metadata.description` is missing.');
  } else if (description.length < DESCRIPTION_MIN) {
    problems.push(
      `\`metadata.description\` is ${description.length} characters; at least ${DESCRIPTION_MIN} are required. Say what the app does, not just its name.`
    );
  } else if (description.length > DESCRIPTION_MAX) {
    problems.push(
      `\`metadata.description\` is ${description.length} characters; the limit is ${DESCRIPTION_MAX}.`
    );
  }

  problems.push(...iconProblems(metadata.icon));

  const { value: category } = resolveCategory(metadata);
  if (!category) {
    problems.push(
      `\`metadata.category\` is missing. Pick exactly one of: ${CATEGORIES.join(', ')}. (Until cargo-mero carries the field, a matching entry in \`tags\` is accepted.)`
    );
  } else if (!CATEGORIES.includes(category)) {
    problems.push(
      `\`metadata.category\` is "${category}", which is not a known category. Pick one of: ${CATEGORIES.join(', ')}.`
    );
  }

  // Recommended, never blocking. Only 2 of 20 published bundles set a license;
  // making it an error would fail eighteen apps over a field nothing reads yet.
  const advisories = [];
  if (!metadata.license) {
    advisories.push('`metadata.license` is not set (recommended).');
  }

  return isNewPackage
    ? { errors: problems, warnings: advisories, category }
    : { errors: [], warnings: [...problems, ...advisories], category };
}

module.exports = {
  CATEGORIES,
  PLACEHOLDER_ICON_SHA256,
  MIN_ICON_DIM,
  MAX_ICON_BYTES,
  validateBundleMetadata,
  resolveCategory,
  iconProblems,
  pngDimensions,
  decodeDataUri,
};
