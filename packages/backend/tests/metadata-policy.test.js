/**
 * Upload-time metadata policy.
 *
 * The assertions that matter are the ones about what a check CANNOT be:
 *
 *  - "has a non-empty icon field" is not an icon check. cargo-mero's
 *    `icon = "default"` sentinel resolves to a real, valid, 512x512 PNG — it is
 *    just the same PNG for every app that sets it. Only a content hash
 *    separates it from a real mark.
 *  - Grandfathering has to be tested from both sides. A rule that fails a new
 *    package but silently also fails an existing one breaks two live apps'
 *    release path, which is exactly what the isNewPackage flag exists to avoid.
 */

const crypto = require('crypto');
const zlib = require('zlib');
const {
  CATEGORIES,
  PLACEHOLDER_ICON_SHA256,
  validateBundleMetadata,
  resolveCategory,
  iconProblems,
} = require('../src/lib/metadata-policy');

/** A real, minimal PNG of the requested size — not a stub with a faked header. */
function png(width, height) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(body) >>> 0 : 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(height * (width * 4 + 1)); // filter byte + row
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const dataUri = buf => `data:image/png;base64,${buf.toString('base64')}`;
const goodIcon = dataUri(png(512, 512));

const completeManifest = () => ({
  package: 'com.example.app',
  appVersion: '1.0.0',
  metadata: {
    name: 'Example',
    description: 'An example application that does a specific useful thing.',
    icon: goodIcon,
    category: 'productivity',
    license: 'MIT',
  },
});

describe('category vocabulary', () => {
  it('is closed, lowercase and kebab-case', () => {
    for (const c of CATEGORIES) expect(c).toMatch(/^[a-z]+(-[a-z]+)*$/);
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });

  it('is exactly the ten the bundler knows', () => {
    // cargo-mero holds the same list in tools/cargo-mero/src/meta.rs with its
    // own copy of this assertion. The two cannot be checked against each other
    // across repos, so each side fails loudly when edited alone.
    expect(CATEGORIES).toEqual([
      'games',
      'productivity',
      'communication',
      'social',
      'art-design',
      'media',
      'planning',
      'security',
      'utilities',
      'developer-tools',
    ]);
  });

  it('accepts every category in the vocabulary', () => {
    // Guards the validator against the list: a value could be added and still
    // be rejected if the check stopped consulting CATEGORIES.
    for (const category of CATEGORIES) {
      const m = completeManifest();
      m.metadata.category = category;
      const { errors } = validateBundleMetadata(m, { isNewPackage: true });
      expect({ category, errors }).toEqual({ category, errors: [] });
    }
  });

  it('rejects a category outside the vocabulary', () => {
    const m = completeManifest();
    m.metadata.category = 'gamez';
    const { errors } = validateBundleMetadata(m, { isNewPackage: true });
    expect(errors.join(' ')).toMatch(/not a known category/);
  });

  it('reads category from metadata.category', () => {
    expect(resolveCategory({ category: 'Games' })).toEqual({
      value: 'games',
      source: 'category',
    });
  });

  it('falls back to a tag naming a category, until cargo-mero carries the field', () => {
    // cargo-mero's [package.metadata.calimero] reader is deny_unknown_fields,
    // so `category` cannot be declared yet. Without this fallback the rule
    // would be unsatisfiable by any publisher.
    expect(resolveCategory({ tags: ['multiplayer', 'games'] })).toEqual({
      value: 'games',
      source: 'tags',
    });
  });

  it('does not invent a category from an unrelated tag', () => {
    expect(resolveCategory({ tags: ['crdt', 'sandbox'] }).value).toBeNull();
  });
});

describe('icon', () => {
  it('accepts a square 512 PNG', () => {
    expect(iconProblems(goodIcon)).toEqual([]);
  });

  it('rejects a missing icon', () => {
    expect(iconProblems(undefined)[0]).toMatch(/missing/);
    expect(iconProblems('')[0]).toMatch(/missing/);
  });

  it('rejects a placeholder by content hash, though it is a perfectly valid PNG', () => {
    // The whole point: the placeholder is well-formed, square and large
    // enough. Only its hash separates it from a real mark, which is why two
    // apps shipped cargo-mero's generic icon for months with nothing noticing.
    const buf = png(512, 512);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');

    expect(iconProblems(dataUri(buf))).toEqual([]); // accepted as a normal icon
    const problems = iconProblems(dataUri(buf), { placeholderHashes: [hash] });
    expect(problems.join(' ')).toMatch(/placeholder mark/);
  });

  it('pins the hash of the asset cargo-mero actually ships', () => {
    // core/tools/cargo-mero/assets/default-icon.png, 43,368 bytes. If cargo-mero
    // changes the asset this constant goes stale silently, so it is asserted
    // rather than merely declared.
    expect(PLACEHOLDER_ICON_SHA256).toBe(
      '46eb3850c27882edfce83e0f9c944744836ec3ce9ffc71a2717405afdafe0f31'
    );
  });

  it('rejects an icon below the desktop launcher size', () => {
    const problems = iconProblems(dataUri(png(256, 256)));
    expect(problems.join(' ')).toMatch(/at least 512x512/);
  });

  it('rejects a non-square icon', () => {
    const problems = iconProblems(dataUri(png(512, 256)));
    expect(problems.join(' ')).toMatch(/must be square/);
  });

  it('rejects a URL instead of inline bytes', () => {
    const problems = iconProblems('https://example.com/icon.png');
    expect(problems[0]).toMatch(/not an inline data URI/);
  });

  it('reports every problem at once, not one per round trip', () => {
    // A publisher fixing one field per upload is why these flows feel hostile.
    const manifest = { metadata: { name: '', description: '', icon: '' } };
    const { errors } = validateBundleMetadata(manifest, { isNewPackage: true });
    expect(errors.length).toBeGreaterThanOrEqual(4); // name, description, icon, category
  });
});

describe('grandfathering', () => {
  it('blocks a new package that is incomplete', () => {
    const m = completeManifest();
    delete m.metadata.icon;
    const { errors } = validateBundleMetadata(m, { isNewPackage: true });
    expect(errors.join(' ')).toMatch(/icon/);
  });

  it('lets an existing package publish, and tells it what it owes', () => {
    // mero-ar and mero-tag are live with no icon. Hard-failing them would
    // break their release path to fix data that is already published.
    const m = completeManifest();
    delete m.metadata.icon;
    const { errors, warnings } = validateBundleMetadata(m, {
      isNewPackage: false,
    });
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toMatch(/icon/);
  });

  it('passes a complete new package with no warnings', () => {
    const { errors, warnings } = validateBundleMetadata(completeManifest(), {
      isNewPackage: true,
    });
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it('treats a missing license as advisory, never blocking', () => {
    // Only 2 of 20 published bundles set one; an error here fails eighteen apps.
    const m = completeManifest();
    delete m.metadata.license;
    const { errors, warnings } = validateBundleMetadata(m, {
      isNewPackage: true,
    });
    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toMatch(/license/);
  });
});

describe('description', () => {
  it('rejects a description that just restates the name', () => {
    const m = completeManifest();
    m.metadata.description = 'Example';
    const { errors } = validateBundleMetadata(m, { isNewPackage: true });
    expect(errors.join(' ')).toMatch(/at least 20/);
  });
});
