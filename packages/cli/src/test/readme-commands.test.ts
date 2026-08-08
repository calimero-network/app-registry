/**
 * The README documented eleven commands that did not exist - apps get/create/
 * update/delete, attestations list/create, developers list, plus interactive
 * and completion modes that were never built - while omitting org and bundle
 * entirely. Prose drifts from a command tree silently; this fails instead.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

/** Group name -> its subcommands, read from the first `new Command()` per file. */
function commandTree(): Map<string, Set<string>> {
  const dir = path.join(pkgRoot, 'src', 'commands');
  const tree = new Map<string, Set<string>>();
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.ts'))) {
    const names = [
      ...fs
        .readFileSync(path.join(dir, file), 'utf8')
        .matchAll(/new Command\('([a-z:-]+)'\)/g),
    ].map(m => m[1]);
    if (names.length > 0) tree.set(names[0], new Set(names.slice(1)));
  }
  return tree;
}

// members and packages nest a second level, so their children are matched
// against the org group rather than a group of their own.
const NESTED = new Set(['members', 'packages']);

describe('README command reference', () => {
  it('only documents commands that exist', () => {
    const tree = commandTree();
    expect(tree.size).toBeGreaterThan(0);

    const readme = fs.readFileSync(path.join(pkgRoot, 'README.md'), 'utf8');
    const unknown: string[] = [];

    for (const [, group, sub] of readme.matchAll(
      /calimero-registry ([a-z][a-z-]*)(?: ([a-z][a-z-]*))?/g
    )) {
      const subs = tree.get(group);
      if (!subs) {
        unknown.push(`${group} (no such command group)`);
      } else if (sub && !subs.has(sub) && !NESTED.has(sub)) {
        unknown.push(`${group} ${sub}`);
      }
    }

    expect([...new Set(unknown)].sort()).toEqual([]);
  });

  it('documents every top-level command group', () => {
    const readme = fs.readFileSync(path.join(pkgRoot, 'README.md'), 'utf8');
    const missing = [...commandTree().keys()].filter(
      group => !readme.includes(`calimero-registry ${group}`)
    );
    expect(missing.sort()).toEqual([]);
  });
});
