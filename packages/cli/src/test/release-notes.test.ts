/**
 * The release-notes path, which nothing else in CI touches.
 *
 * `.releaserc.json` asks @semantic-release/release-notes-generator for the
 * `conventionalcommits` preset, and the preset hands its templates to
 * conventional-changelog-writer. Those two move independently, and when they
 * disagree the generator does not fail — it emits the version header and drops
 * every commit section. Release notes go out empty and nobody finds out until
 * someone reads a release.
 *
 * That is exactly what a lone bump of the preset to 10.x did (the writer stays
 * pinned at 8.4.0 by the root `pnpm.overrides`), so the pairing is pinned here
 * by generating notes for real and asserting the sections are present.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

type PluginEntry = string | [string, Record<string, unknown>];

/** The generator's own config, read from .releaserc.json rather than restated. */
function presetConfig(): Record<string, unknown> {
  const config = JSON.parse(
    fs.readFileSync(path.join(packageRoot, '.releaserc.json'), 'utf8')
  ) as { plugins: PluginEntry[] };
  const entry = config.plugins.find(
    (plugin): plugin is [string, Record<string, unknown>] =>
      Array.isArray(plugin) && plugin[0].includes('release-notes-generator')
  );
  if (!entry) throw new Error('release-notes-generator is not configured');
  return entry[1];
}

const commits = [
  {
    hash: 'a'.repeat(40),
    message: 'feat(bundle): add the --service flag',
    subject: 'add the --service flag',
  },
  {
    hash: 'b'.repeat(40),
    message: 'fix(push): reject a stale signature',
    subject: 'reject a stale signature',
  },
  {
    hash: 'c'.repeat(40),
    message: 'feat!: drop the V1 endpoints\n\nBREAKING CHANGE: V1 is gone.',
    subject: 'drop the V1 endpoints',
  },
];

describe('release notes', () => {
  it('render every section for the configured preset', async () => {
    const { generateNotes } =
      await import('@semantic-release/release-notes-generator');

    const notes: string = await generateNotes(presetConfig(), {
      cwd: packageRoot,
      options: {
        repositoryUrl: 'https://github.com/calimero-network/app-registry',
      },
      lastRelease: { gitTag: 'cli-v1.0.0', version: '1.0.0' },
      nextRelease: { gitTag: 'cli-v1.1.0', version: '1.1.0', channel: null },
      commits,
      logger: { log: () => {}, error: () => {}, warn: () => {} },
    });

    // The header alone is what a preset/writer mismatch produces, so each
    // assertion below is a separate way of catching the same silent failure.
    expect(notes).toContain('1.1.0');
    expect(notes).toContain('Features');
    expect(notes).toContain('add the --service flag');
    expect(notes).toContain('Bug Fixes');
    expect(notes).toContain('reject a stale signature');
    expect(notes).toContain('BREAKING');
    expect(notes).toContain('V1 is gone');
  });
});
