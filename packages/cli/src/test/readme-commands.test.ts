/**
 * The README documented eleven commands that did not exist - apps get/create/
 * update/delete, attestations list/create, developers list, plus interactive
 * and completion modes that were never built - while omitting org, bundle and
 * ipfs entirely. Prose drifts from a command tree silently; this fails instead.
 *
 * The tree comes from the command objects themselves. Reading it out of the
 * source took a heuristic per question - which declarations exist, which hold
 * others, which nest under which - and each one was a guess that could be
 * wrong. Commander already knows. Importing only became possible once the V1
 * commands went, since they pulled in a package this one never declared.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';

import { bundleCommand } from '../commands/bundle.js';
import { configCommand } from '../commands/config.js';
import { healthCommand } from '../commands/health.js';
import { ipfsCommand } from '../commands/ipfs.js';
import { localCommand } from '../commands/local.js';
import { orgCommand } from '../commands/org.js';

// The same set index.ts registers on the program.
const GROUPS: Command[] = [
  bundleCommand,
  configCommand,
  healthCommand,
  ipfsCommand,
  localCommand,
  orgCommand,
];

// This package's own README, not the repository root's. The two document
// different things and only this one claims to be a command reference.
const README = fs.readFileSync(
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'README.md'
  ),
  'utf8'
);

/** Every invocable path: "org", "org members", "org members add". */
function invocablePaths(): Set<string> {
  const paths = new Set<string>();
  const walk = (cmd: Command, prefix: string[]) => {
    const here = [...prefix, cmd.name()];
    paths.add(here.join(' '));
    for (const child of cmd.commands) walk(child as Command, here);
  };
  for (const group of GROUPS) walk(group, []);
  return paths;
}

/**
 * Command invocations in the README, as [group, ...subcommands].
 *
 * Fenced blocks only. Naming the tool in a sentence is not an invocation, and
 * scanning prose would read "calimero-registry is a command-line tool" as the
 * path `is a command-line tool` - failing the suite over a wording change.
 */
function documentedPaths(): string[][] {
  const fenced = [...README.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(
    m => m[1]
  );
  return fenced.flatMap(block =>
    [...block.matchAll(/calimero-registry((?: [a-z][a-z-]*)+)/g)].map(m =>
      m[1].trim().split(/\s+/)
    )
  );
}

/** Whether any real command sits below this path. */
function holdsChildren(prefix: string, real: Set<string>): boolean {
  for (const p of real) if (p.startsWith(`${prefix} `)) return true;
  return false;
}

describe('README command reference', () => {
  it('only documents commands that exist', () => {
    const real = invocablePaths();
    expect(real.size).toBeGreaterThan(0);

    const unknown = new Set<string>();
    for (const tokens of documentedPaths()) {
      // Walk while each prefix is a real path. The first token that is not
      // ends the command, and the rest are arguments - unless the prefix so
      // far holds subcommands, in which case the token was meant to be one.
      // Checking names without their position would accept `org packages add`,
      // since `add` exists under `members`.
      let matched = '';
      for (const token of tokens) {
        const next = matched ? `${matched} ${token}` : token;
        if (real.has(next)) {
          matched = next;
          continue;
        }
        if (!matched) unknown.add(`${token} (no such command group)`);
        else if (holdsChildren(matched, real))
          unknown.add(`${matched} ${token}`);
        break;
      }
    }

    expect([...unknown].sort()).toEqual([]);
  });

  it('documents every command group and subcommand', () => {
    // Full paths, so documenting `org members update` does not also satisfy
    // the check for `org update`.
    const documented = new Set(
      documentedPaths().flatMap(tokens =>
        tokens.map((_, i) => tokens.slice(0, i + 1).join(' '))
      )
    );
    const missing = [...invocablePaths()].filter(p => !documented.has(p));
    expect(missing.sort()).toEqual([]);
  });
});
