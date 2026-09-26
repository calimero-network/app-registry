'use strict';

/**
 * The app guide (`metadata.guide`) format. This module is its only
 * definition; mero-mcp parses guides with the same rules.
 */

const PROCEDURES_SECTION = 'Procedures';
const REQUIRED_SECTIONS = [
  'Overview',
  'Context model',
  'Getting started',
  PROCEDURES_SECTION,
  'Rules and limits',
];
const MAX_GUIDE_BYTES = 16384; // UTF-8 bytes: what an agent's context pays for
const FIELD = 'metadata.guide';
const HEADING = /^(#{2,3}) (.+)$/;
const FENCE = /^ *```/; // `~~~` is deliberately not a fence; mero-mcp parses the same way

/** Level-2 and level-3 headings outside ``` fences, in document order. */
function headingsOf(guide) {
  const headings = [];
  let inFence = false;
  for (const raw of guide.split('\n')) {
    const line = raw.trimEnd();
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING.exec(line);
    if (match) headings.push({ level: match[1].length, title: match[2] });
  }
  return headings;
}

/** @returns {string[]} one entry per problem; empty when the guide is valid */
function validateGuide(guide) {
  if (guide == null) return [`${FIELD}: required`];
  if (typeof guide !== 'string') return [`${FIELD}: must be a string`];
  if (!guide.trim()) return [`${FIELD}: required`];

  // A leading BOM survives copy-paste from some editors; strip one so it never
  // hides the Overview heading it precedes.
  const text = guide.startsWith('\ufeff') ? guide.slice(1) : guide;

  const problems = [];
  const bytes = Buffer.byteLength(guide, 'utf8');
  if (bytes > MAX_GUIDE_BYTES) {
    problems.push(
      `${FIELD}: ${bytes} bytes exceeds the ${MAX_GUIDE_BYTES} byte limit`
    );
  }
  const headings = headingsOf(text);
  const sections = new Set(
    headings.filter(h => h.level === 2).map(h => h.title)
  );
  for (const section of REQUIRED_SECTIONS) {
    if (!sections.has(section)) {
      problems.push(`${FIELD}: missing section '## ${section}'`);
    }
  }
  // Only ## and ### are collected, so Procedures has a ### exactly when one follows it.
  const procedures = headings.findIndex(
    h => h.level === 2 && h.title === PROCEDURES_SECTION
  );
  if (procedures !== -1 && headings[procedures + 1]?.level !== 3) {
    problems.push(
      `${FIELD}: '## ${PROCEDURES_SECTION}' has no '###' procedure`
    );
  }
  return problems;
}

module.exports = { validateGuide };
