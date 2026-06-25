/**
 * Multi-service bundle helpers.
 *
 * A bundle always has a MAIN application (manifest.wasm / manifest.abi, packed
 * as `app.wasm` / `abi.json`). A multi-service bundle additionally ships one or
 * more named SERVICE WASMs alongside the main app — e.g. a "tictactoe" main app
 * with a "lobby" matchmaking service. Service artifacts are packed under
 * `services/<name>.wasm` (+ optional `services/<name>.abi.json`).
 *
 * These helpers are pure (no I/O) so they can be unit-tested in isolation; the
 * `bundle` command wires them to the filesystem.
 */

import type { BundleManifest } from './local-storage.js';

/** Source-file references for a service, as authored on the CLI or in a manifest config file. */
export interface ServiceSource {
  name: string;
  wasm: string; // path to the service WASM file
  abi?: string; // optional path to the service ABI JSON file
}

/** Service names must be filesystem-safe and collision-free with the main `app.wasm`. */
const SERVICE_NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

/**
 * Validate a service name. Names become path segments (`services/<name>.wasm`),
 * so they must be lowercase, free of separators, and not the reserved main name.
 * @throws Error on an invalid name.
 */
export function validateServiceName(name: string): void {
  if (!name || !SERVICE_NAME_RE.test(name)) {
    throw new Error(
      `Invalid service name "${name}". Use lowercase letters, digits, "-" or "_" (must start alphanumeric).`
    );
  }
  // Bound the length so it can't blow past filesystem path-component limits
  // (most systems cap a component at 255 bytes; "<name>.abi.json" adds 9).
  if (name.length > 64) {
    throw new Error(
      `Invalid service name "${name}": must be at most 64 characters.`
    );
  }
  if (name === 'app') {
    throw new Error(
      'Service name "app" is reserved for the main application. Choose another name.'
    );
  }
}

/**
 * Parse a `--service` CLI spec of the form:
 *   `name=path/to.wasm`
 *   `name=path/to.wasm,abi=path/to-abi.json`
 *
 * The ABI segment is optional. Whitespace around tokens is trimmed.
 * @throws Error on a malformed spec.
 */
export function parseServiceSpec(spec: string): ServiceSource {
  const eq = spec.indexOf('=');
  if (eq === -1) {
    throw new Error(
      `Invalid --service "${spec}". Expected "name=path.wasm" or "name=path.wasm,abi=path.json".`
    );
  }
  const name = spec.slice(0, eq).trim();
  let rest = spec.slice(eq + 1).trim();

  let abi: string | undefined;
  // Optional ",abi=<path>" tail, tolerant of whitespace around the separator.
  const abiMatch = rest.match(/,\s*abi\s*=\s*(.*)$/);
  if (abiMatch) {
    abi = abiMatch[1].trim();
    rest = rest.slice(0, abiMatch.index).trim();
    if (!abi) {
      throw new Error(`Invalid --service "${spec}": empty abi path.`);
    }
  }

  const wasm = rest;
  if (!wasm) {
    throw new Error(`Invalid --service "${spec}": missing WASM path.`);
  }
  // A comma here means either a comma in the WASM path (unsupported — it would
  // be silently truncated) or a malformed abi tail (e.g. ",ab=" / ",abi"). Fail
  // loudly rather than packing the wrong file.
  if (wasm.includes(',')) {
    throw new Error(
      `Invalid --service "${spec}": unexpected comma in WASM path. Use "name=path.wasm,abi=path.json"; commas in paths are not supported.`
    );
  }

  validateServiceName(name);
  return abi ? { name, wasm, abi } : { name, wasm };
}

/** The in-bundle artifact path for a service's WASM (e.g. "services/lobby.wasm"). */
export function serviceWasmPath(name: string): string {
  return `services/${name}.wasm`;
}

/** The in-bundle artifact path for a service's ABI (e.g. "services/lobby.abi.json"). */
export function serviceAbiPath(name: string): string {
  return `services/${name}.abi.json`;
}

/**
 * Reject duplicate service names across the merged set (CLI + manifest config).
 * @throws Error listing the first duplicate found.
 */
export function assertUniqueServiceNames(services: ServiceSource[]): void {
  const seen = new Set<string>();
  for (const s of services) {
    if (seen.has(s.name)) {
      throw new Error(`Duplicate service name "${s.name}".`);
    }
    seen.add(s.name);
  }
}

/**
 * Collect the list of files (relative to the bundle directory) that a manifest
 * references and that must therefore be packed into the `.mpk`. Always includes
 * `manifest.json` and the main `wasm.path`; includes the main `abi.path` and
 * each service's `wasm.path` / `abi.path` when present.
 *
 * Used by `bundle push` when packing a directory so service WASMs are not
 * silently dropped from the archive.
 */
export function collectBundleFiles(manifest: BundleManifest): string[] {
  const files = ['manifest.json'];
  if (manifest.wasm?.path) files.push(manifest.wasm.path);
  if (manifest.abi?.path) files.push(manifest.abi.path);
  for (const svc of manifest.services ?? []) {
    if (svc.wasm?.path) files.push(svc.wasm.path);
    if (svc.abi?.path) files.push(svc.abi.path);
  }
  // De-dupe while preserving order (a malformed manifest could repeat a path).
  return [...new Set(files)];
}
