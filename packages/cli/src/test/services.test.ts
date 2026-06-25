import { describe, it, expect } from 'vitest';
import {
  parseServiceSpec,
  validateServiceName,
  serviceWasmPath,
  serviceAbiPath,
  assertUniqueServiceNames,
  assertSafeBundlePath,
  collectBundleFiles,
} from '../lib/services.js';
import type { BundleManifest } from '../lib/local-storage.js';

describe('parseServiceSpec', () => {
  it('parses name and wasm path', () => {
    expect(parseServiceSpec('lobby=lobby.wasm')).toEqual({
      name: 'lobby',
      wasm: 'lobby.wasm',
    });
  });

  it('parses name, wasm and abi', () => {
    expect(
      parseServiceSpec('lobby=res/lobby.wasm,abi=res/lobby-abi.json')
    ).toEqual({
      name: 'lobby',
      wasm: 'res/lobby.wasm',
      abi: 'res/lobby-abi.json',
    });
  });

  it('trims whitespace around tokens', () => {
    expect(parseServiceSpec(' lobby = lobby.wasm , abi = abi.json ')).toEqual({
      name: 'lobby',
      wasm: 'lobby.wasm',
      abi: 'abi.json',
    });
  });

  it('throws when there is no "="', () => {
    expect(() => parseServiceSpec('lobby.wasm')).toThrow(/Expected "name=path/);
  });

  it('throws on missing wasm path', () => {
    expect(() => parseServiceSpec('lobby=')).toThrow(/missing WASM path/);
  });

  it('throws on empty abi path', () => {
    expect(() => parseServiceSpec('lobby=lobby.wasm,abi=')).toThrow(
      /empty abi path/
    );
  });

  it('rejects an invalid service name', () => {
    expect(() => parseServiceSpec('Lobby=lobby.wasm')).toThrow(
      /Invalid service name/
    );
    expect(() => parseServiceSpec('foo/bar=lobby.wasm')).toThrow(
      /Invalid service name/
    );
  });

  it('rejects a comma in the WASM path rather than truncating it', () => {
    expect(() => parseServiceSpec('lobby=path/to,file.wasm')).toThrow(
      /unexpected comma in WASM path/
    );
  });
});

describe('validateServiceName', () => {
  it('accepts lowercase alphanumeric with - and _', () => {
    expect(() => validateServiceName('lobby')).not.toThrow();
    expect(() => validateServiceName('match-maker_2')).not.toThrow();
  });

  it('rejects empty, uppercase, leading-symbol and reserved "app"', () => {
    expect(() => validateServiceName('')).toThrow();
    expect(() => validateServiceName('Lobby')).toThrow();
    expect(() => validateServiceName('-lobby')).toThrow();
    expect(() => validateServiceName('app')).toThrow(/reserved/);
  });

  it('rejects a name longer than 64 characters', () => {
    expect(() => validateServiceName('a'.repeat(65))).toThrow(
      /at most 64 characters/
    );
    expect(() => validateServiceName('a'.repeat(64))).not.toThrow();
  });

  it('rejects non-string names (e.g. a number from manifest JSON)', () => {
    // Manifest JSON can violate the `string` type at runtime.
    expect(() => validateServiceName(123 as unknown as string)).toThrow(
      /Invalid service name/
    );
    expect(() => validateServiceName(null as unknown as string)).toThrow(
      /Invalid service name/
    );
  });
});

describe('artifact path helpers', () => {
  it('builds service wasm/abi paths under services/', () => {
    expect(serviceWasmPath('lobby')).toBe('services/lobby.wasm');
    expect(serviceAbiPath('lobby')).toBe('services/lobby.abi.json');
  });
});

describe('assertUniqueServiceNames', () => {
  it('passes for unique names', () => {
    expect(() =>
      assertUniqueServiceNames([
        { name: 'lobby', wasm: 'a.wasm' },
        { name: 'chat', wasm: 'b.wasm' },
      ])
    ).not.toThrow();
  });

  it('throws on a duplicate name', () => {
    expect(() =>
      assertUniqueServiceNames([
        { name: 'lobby', wasm: 'a.wasm' },
        { name: 'lobby', wasm: 'b.wasm' },
      ])
    ).toThrow(/Duplicate service name "lobby"/);
  });
});

describe('collectBundleFiles', () => {
  const base: BundleManifest = {
    version: '1.0',
    package: 'com.calimero.ttt',
    appVersion: '1.0.0',
    wasm: { path: 'app.wasm', hash: 'h', size: 1 },
    migrations: [],
  };

  it('returns manifest + main wasm for a single-app bundle (backward compat)', () => {
    expect(collectBundleFiles(base)).toEqual(['manifest.json', 'app.wasm']);
  });

  it('includes the main abi when present', () => {
    const m = { ...base, abi: { path: 'abi.json', hash: 'h', size: 2 } };
    expect(collectBundleFiles(m)).toEqual([
      'manifest.json',
      'app.wasm',
      'abi.json',
    ]);
  });

  it('includes service wasm and abi files', () => {
    const m: BundleManifest = {
      ...base,
      abi: { path: 'abi.json', hash: 'h', size: 2 },
      services: [
        {
          name: 'lobby',
          wasm: { path: 'services/lobby.wasm', hash: 'h', size: 3 },
          abi: { path: 'services/lobby.abi.json', hash: 'h', size: 4 },
        },
        {
          name: 'chat',
          wasm: { path: 'services/chat.wasm', hash: 'h', size: 5 },
        },
      ],
    };
    expect(collectBundleFiles(m)).toEqual([
      'manifest.json',
      'app.wasm',
      'abi.json',
      'services/lobby.wasm',
      'services/lobby.abi.json',
      'services/chat.wasm',
    ]);
  });

  it('de-dupes repeated paths', () => {
    const m: BundleManifest = {
      ...base,
      services: [
        {
          name: 'dup',
          wasm: { path: 'app.wasm', hash: 'h', size: 1 },
        },
      ],
    };
    expect(collectBundleFiles(m)).toEqual(['manifest.json', 'app.wasm']);
  });

  it('throws when a declared service has no wasm.path', () => {
    const m = {
      ...base,
      services: [{ name: 'lobby' }],
    } as unknown as BundleManifest;
    expect(() => collectBundleFiles(m)).toThrow(/has no wasm.path/);
  });

  it('rejects a service path that escapes the bundle directory', () => {
    const m: BundleManifest = {
      ...base,
      services: [
        {
          name: 'evil',
          wasm: { path: '../../etc/passwd', hash: 'h', size: 1 },
        },
      ],
    };
    expect(() => collectBundleFiles(m)).toThrow(/Unsafe bundle path/);
  });
});

describe('assertSafeBundlePath', () => {
  it('accepts safe relative paths', () => {
    expect(() => assertSafeBundlePath('app.wasm')).not.toThrow();
    expect(() => assertSafeBundlePath('services/lobby.wasm')).not.toThrow();
  });

  it('rejects absolute paths', () => {
    expect(() => assertSafeBundlePath('/etc/passwd')).toThrow(
      /Unsafe bundle path/
    );
    expect(() => assertSafeBundlePath('C:\\Windows\\x')).toThrow(
      /Unsafe bundle path/
    );
  });

  it('rejects ".." traversal with either separator', () => {
    expect(() => assertSafeBundlePath('../app.wasm')).toThrow(
      /Unsafe bundle path/
    );
    expect(() => assertSafeBundlePath('services/../../app.wasm')).toThrow(
      /Unsafe bundle path/
    );
    expect(() => assertSafeBundlePath('services\\..\\app.wasm')).toThrow(
      /Unsafe bundle path/
    );
  });

  it('rejects "." segments and empty segments', () => {
    expect(() => assertSafeBundlePath('services/./x.wasm')).toThrow(
      /Unsafe bundle path/
    );
    expect(() => assertSafeBundlePath('services//x.wasm')).toThrow(
      /Unsafe bundle path/
    );
    expect(() => assertSafeBundlePath('')).toThrow(/Unsafe bundle path/);
  });
});
