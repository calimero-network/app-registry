/**
 * react and react-dom must resolve to the exact same version.
 *
 * React 19 ships the reconciler across both packages and they are released in
 * lockstep; a mismatch throws at runtime in the deployed app (React error #527)
 * while every build, test and type-check passes. It has reached production once
 * already, from a Dependabot PR that bumped only `react` and left the lockfile's
 * `react-dom` behind, and a second PR proposed the same thing weeks later.
 *
 * Reading the installed packages rather than the manifest is deliberate: the
 * specs can both say `^19.2.8` while the lockfile pins different versions, and
 * the lockfile is what ships.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

describe('react and react-dom', () => {
  it('resolve to the same installed version', () => {
    const react = require('react/package.json') as { version: string };
    const reactDom = require('react-dom/package.json') as { version: string };

    expect(reactDom.version).toBe(react.version);
  });
});
