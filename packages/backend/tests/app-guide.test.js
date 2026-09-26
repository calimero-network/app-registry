/**
 * Pins each guide rule.
 */

const { validateGuide } = require('../src/lib/app-guide');
const { VALID_GUIDE } = require('./helpers/publishable');

const SECTIONS = [
  'Overview',
  'Context model',
  'Getting started',
  'Procedures',
  'Rules and limits',
];

const padToBytes = (text, bytes) =>
  text + 'a'.repeat(bytes - Buffer.byteLength(text, 'utf8'));

describe('validateGuide', () => {
  test('a guide with every section and a procedure passes', () => {
    expect(validateGuide(VALID_GUIDE)).toEqual([]);
  });

  test('a missing guide is required', () => {
    expect(validateGuide(undefined)).toEqual(['metadata.guide: required']);
    expect(validateGuide(null)).toEqual(['metadata.guide: required']);
  });

  test('a non-string guide is rejected', () => {
    expect(validateGuide(42)).toEqual(['metadata.guide: must be a string']);
    expect(validateGuide({ text: VALID_GUIDE })).toEqual([
      'metadata.guide: must be a string',
    ]);
  });

  test('an empty or whitespace-only guide is required, not five missing sections', () => {
    expect(validateGuide('')).toEqual(['metadata.guide: required']);
    expect(validateGuide('   \n\t')).toEqual(['metadata.guide: required']);
  });

  test.each(SECTIONS)('a guide without ## %s is rejected', section => {
    const guide = VALID_GUIDE.replace(`## ${section}\n`, '');
    expect(validateGuide(guide)).toEqual([
      `metadata.guide: missing section '## ${section}'`,
    ]);
  });

  test('section order is free and extra headings are allowed', () => {
    const [overview, ...rest] = VALID_GUIDE.split('\n\n');
    const guide = [...rest, overview, '## Changelog\nNone yet.'].join('\n\n');
    expect(validateGuide(guide)).toEqual([]);
  });

  test('a CRLF guide passes', () => {
    expect(validateGuide(VALID_GUIDE.replace(/\n/g, '\r\n'))).toEqual([]);
  });

  test('trailing whitespace after a heading is ignored', () => {
    const guide = VALID_GUIDE.replace('## Overview', '## Overview \t');
    expect(validateGuide(guide)).toEqual([]);
  });

  test('a guide with a leading UTF-8 BOM passes', () => {
    expect(validateGuide(`\ufeff${VALID_GUIDE}`)).toEqual([]);
  });

  test('a BOM counts toward the byte limit', () => {
    const guide = `\ufeff${padToBytes(VALID_GUIDE, 16382)}`;
    expect(Buffer.byteLength(guide, 'utf8')).toBe(16385);
    expect(validateGuide(guide)).toEqual([
      'metadata.guide: 16385 bytes exceeds the 16384 byte limit',
    ]);
  });

  test('a heading inside a code fence does not count', () => {
    const guide = VALID_GUIDE.replace(
      '## Context model\n',
      '```md\n## Context model\n```\n'
    );
    expect(validateGuide(guide)).toEqual([
      "metadata.guide: missing section '## Context model'",
    ]);
  });

  test('a fence indented by spaces still hides its headings', () => {
    const guide = VALID_GUIDE.replace(
      '## Context model\n',
      '   ```\n## Context model\n   ```\n'
    );
    expect(validateGuide(guide)).toEqual([
      "metadata.guide: missing section '## Context model'",
    ]);
  });

  test('~~~ is not a fence, so headings after it still count', () => {
    const guide = VALID_GUIDE.replace(
      '## Context model\n',
      '~~~\n## Context model\n~~~\n'
    );
    expect(validateGuide(guide)).toEqual([]);
  });

  test('## Procedures without a ### is rejected', () => {
    const guide = VALID_GUIDE.replace('### Increment the counter\n', '');
    expect(validateGuide(guide)).toEqual([
      "metadata.guide: '## Procedures' has no '###' procedure",
    ]);
  });

  test('a ### under a different ## does not count for Procedures', () => {
    const guide = VALID_GUIDE.replace(
      '### Increment the counter\n',
      ''
    ).replace(
      '## Rules and limits\n',
      '## Rules and limits\n### Increment the counter\n'
    );
    expect(validateGuide(guide)).toEqual([
      "metadata.guide: '## Procedures' has no '###' procedure",
    ]);
  });

  test('exactly 16384 bytes is accepted', () => {
    const guide = padToBytes(VALID_GUIDE, 16384);
    expect(Buffer.byteLength(guide, 'utf8')).toBe(16384);
    expect(validateGuide(guide)).toEqual([]);
  });

  test('the cap counts UTF-8 bytes, not characters', () => {
    const base = Buffer.byteLength(VALID_GUIDE, 'utf8');
    const guide = VALID_GUIDE + 'é'.repeat(8192);
    expect(guide.length).toBeLessThan(16384);
    expect(validateGuide(guide)).toEqual([
      `metadata.guide: ${base + 16384} bytes exceeds the 16384 byte limit`,
    ]);
  });

  test('every problem is reported together', () => {
    const guide = padToBytes(
      VALID_GUIDE.replace('## Overview\n', '')
        .replace('## Getting started\n', '')
        .replace('### Increment the counter\n', ''),
      16400
    );
    expect(validateGuide(guide)).toEqual([
      'metadata.guide: 16400 bytes exceeds the 16384 byte limit',
      "metadata.guide: missing section '## Overview'",
      "metadata.guide: missing section '## Getting started'",
      "metadata.guide: '## Procedures' has no '###' procedure",
    ]);
  });
});
