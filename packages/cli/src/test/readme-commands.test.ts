/**
 * The README documented eleven commands that did not exist - apps get/create/
 * update/delete, attestations list/create, developers list, plus interactive
 * and completion modes that were never built - while omitting org, bundle and
 * ipfs entirely. Prose drifts from a command tree silently; this fails instead.
 *
 * Names are read from source rather than by importing the command modules:
 * three of them pull in the client library, which this package does not
 * declare as a dependency, so importing would fail here for a reason that has
 * nothing to do with the README.
 *
 * Every token is checked against the group that owns it, at any depth, so a
 * typo in `org members add` is caught. Exact tree position is not modelled -
 * the two files that build subcommands in factory functions rather than inline
 * put nesting out of reach of a source scan - so a real name in the wrong slot
 * would pass. Renames and removals, which is what actually rots, do not.
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

/** Group name -> every command name declared in that group's file. */
function commandNames(): Map<string, Set<string>> {
  const groups = new Map<string, Set<string>>();
  for (const [, names] of commandFiles()) {
    // The group is the command the module exports, which is always declared
    // first; the rest are its subcommands at some depth.
    if (names.length > 0) groups.set(names[0], new Set(names.slice(1)));
  }
  return groups;
}

/**
 * Group -> the subcommands that hold further subcommands, so `org members add`
 * gets its third token checked while `config set registry-url` stops at `set`
 * and treats the rest as arguments.
 *
 * A container is a command with no `.action()` of its own; it only holds
 * others. Looking for a following `.addCommand(` instead does not work: the
 * one that opens the next sibling sits inside the same span.
 *
 * Keyed by group because names repeat - `get` is a leaf in several files.
 */
function containers(): Map<string, Set<string>> {
  const byGroup = new Map<string, Set<string>>();
  for (const [src, names] of commandFiles()) {
    if (names.length === 0) continue;
    const held = new Set<string>();
    for (const name of names.slice(1)) {
      const at = src.indexOf(`new Command('${name}')`);
      const next = src.indexOf('new Command(', at + 1);
      const span = src.slice(at, next === -1 ? undefined : next);
      if (!span.includes('.action(')) held.add(name);
    }
    byGroup.set(names[0], held);
  }
  return byGroup;
}

function commandFiles(): Array<[string, string[]]> {
  const dir = path.join(pkgRoot, 'src', 'commands');
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.ts'))
    .map(f => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const names = [...src.matchAll(/new Command\('([a-z:-]+)'\)/g)].map(
        m => m[1]
      );
      return [src, names] as [string, string[]];
    });
}

/**
 * Command invocations in the README, as [group, ...subcommands]. Tokens are
 * taken until one stops looking like a subcommand, so `<orgId>`, `--remote`
 * and `[-r admin|member]` end the path rather than being read as one.
 */
function documentedPaths(): string[][] {
  const readme = fs.readFileSync(path.join(pkgRoot, 'README.md'), 'utf8');
  return [...readme.matchAll(/calimero-registry((?: [a-z][a-z-]*)+)/g)].map(m =>
    m[1].trim().split(/\s+/)
  );
}

describe('README command reference', () => {
  it('only documents commands that exist', () => {
    const groups = commandNames();
    expect(groups.size).toBeGreaterThan(0);

    const byGroup = containers();
    const unknown = new Set<string>();

    for (const [group, ...rest] of documentedPaths()) {
      const names = groups.get(group);
      if (!names) {
        unknown.add(`${group} (no such command group)`);
        continue;
      }
      const holds = byGroup.get(group) ?? new Set<string>();
      // Walk while each token is a subcommand position. The first token always
      // is; a later one only when its parent holds subcommands, so `config set
      // registry-url` stops at `set` and the rest reads as arguments.
      let path = group;
      for (const [i, token] of rest.entries()) {
        if (i > 0 && !holds.has(rest[i - 1])) break;
        if (!names.has(token)) {
          unknown.add(`${path} ${token}`);
          break;
        }
        path += ` ${token}`;
      }
    }

    expect([...unknown].sort()).toEqual([]);
  });

  it('documents every command group and subcommand', () => {
    const documented = documentedPaths();
    const missing: string[] = [];

    for (const [group, names] of commandNames()) {
      const forGroup = documented.filter(p => p[0] === group);
      if (forGroup.length === 0) {
        missing.push(group);
        continue;
      }
      const mentioned = new Set(forGroup.flatMap(p => p.slice(1)));
      for (const name of names) {
        if (!mentioned.has(name)) missing.push(`${group} ${name}`);
      }
    }

    expect(missing.sort()).toEqual([]);
  });
});
