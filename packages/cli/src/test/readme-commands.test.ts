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

/**
 * Every invocable path, at its real depth: "org", "org members",
 * "org members add". A container's children are the declarations that fall
 * inside its span, so a name declared at two depths - `update` is both
 * `org update` and `org members update` - is two distinct paths. Flattening
 * them into one set per group lets either one satisfy the check for both.
 */
function invocablePaths(): Set<string> {
  const paths = new Set<string>();
  for (const { src, declarations } of commandFiles()) {
    if (declarations.length === 0) continue;
    const group = declarations[0].name;
    paths.add(group);

    const spans = declarations.slice(1).map((decl, i) => {
      const next = declarations[i + 2];
      const end = next ? next.index : src.length;
      return {
        ...decl,
        end,
        isContainer: !src.slice(decl.index, end).includes('.action('),
      };
    });

    // A container's span stops at its first child, so its reach is everything
    // up to the next declaration at or above its own nesting.
    for (const decl of spans) {
      const parent = spans.find(
        c =>
          c.isContainer &&
          c.index < decl.index &&
          decl.index < containerEnd(c, spans)
      );
      paths.add([group, parent?.name, decl.name].filter(Boolean).join(' '));
    }
  }
  return paths;
}

/** How far a container reaches: up to the next container, or the file's end. */
function containerEnd(
  container: { index: number; end: number },
  all: Array<{ index: number; isContainer: boolean; end: number }>
): number {
  const next = all.find(c => c.isContainer && c.index > container.index);
  return next ? next.index : Infinity;
}

interface Declaration {
  name: string;
  index: number;
}

function commandFiles(): Array<{ src: string; declarations: Declaration[] }> {
  const dir = path.join(pkgRoot, 'src', 'commands');
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.ts'))
    .map(f => {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      const declarations = [
        ...src.matchAll(/new Command\('([a-z:-]+)'\)/g),
      ].map(m => ({ name: m[1], index: m.index ?? 0 }));
      return { src, declarations };
    });
}

/**
 * Command invocations in the README, as [group, ...subcommands]. Tokens are
 * taken until one stops looking like a subcommand, so `<orgId>`, `--remote`
 * and `[-r admin|member]` end the path rather than being read as one.
 *
 * Fenced blocks only. Naming the tool in a sentence is not an invocation, and
 * scanning prose would read "calimero-registry is a command-line tool" as the
 * path `is a command-line tool` - failing the suite over a wording change.
 */
function documentedPaths(): string[][] {
  const readme = fs.readFileSync(path.join(pkgRoot, 'README.md'), 'utf8');
  const fenced = [...readme.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(
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
      // Checking against the whole file's names instead would accept
      // `org packages add`, since `add` exists under `members`.
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
