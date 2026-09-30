const {
  StorageUnavailableError,
  isNonProductionDeployment,
  storageVar,
  isStorageBlocked,
  createUnavailableKv,
} = require('@calimero-network/registry-shared/storage-env');

const mockCreateClient = jest.fn(() => ({ on: jest.fn() }));
jest.mock('redis', () => ({ createClient: mockCreateClient }));

const STORAGE_KEYS = [
  'VERCEL',
  'VERCEL_ENV',
  'REDIS_URL',
  'PREVIEW_REDIS_URL',
  'GCS_BUCKET',
  'PREVIEW_GCS_BUCKET',
];

const KV_CLIENTS = ['../src/lib/kv-client', '../../../api/lib/kv-client'];

function withEnv(vars, fn) {
  const saved = {};
  for (const k of STORAGE_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of STORAGE_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

function loadKv(modulePath, vars) {
  return withEnv(vars, () => {
    let mod;
    jest.isolateModules(() => {
      mod = require(modulePath);
    });
    return mod;
  });
}

beforeEach(() => {
  mockCreateClient.mockClear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('storageVar', () => {
  test('reads the plain variable when VERCEL_ENV is unset', () => {
    const env = { REDIS_URL: 'redis://local', PREVIEW_REDIS_URL: 'x' };
    expect(isNonProductionDeployment(env)).toBe(false);
    expect(storageVar('REDIS_URL', env)).toBe('redis://local');
  });

  test('reads the plain variable in production', () => {
    const env = { VERCEL_ENV: 'production', REDIS_URL: 'redis://prod' };
    expect(storageVar('REDIS_URL', env)).toBe('redis://prod');
    expect(isStorageBlocked(env)).toBe(false);
  });

  test.each(['preview', 'development'])(
    'ignores the plain variable when VERCEL_ENV=%s',
    vercelEnv => {
      const env = { VERCEL_ENV: vercelEnv, REDIS_URL: 'redis://prod' };
      expect(isNonProductionDeployment(env)).toBe(true);
      expect(storageVar('REDIS_URL', env)).toBeUndefined();
      expect(isStorageBlocked(env)).toBe(true);
    }
  );

  test('uses the PREVIEW_ variable outside production', () => {
    const env = {
      VERCEL_ENV: 'preview',
      REDIS_URL: 'redis://prod',
      PREVIEW_REDIS_URL: 'redis://preview',
      GCS_BUCKET: 'prod-bucket',
    };
    expect(storageVar('REDIS_URL', env)).toBe('redis://preview');
    expect(storageVar('GCS_BUCKET', env)).toBeUndefined();
    expect(isStorageBlocked(env)).toBe(false);
  });
});

describe('createUnavailableKv', () => {
  test('every operation rejects with a 503 StorageUnavailableError', async () => {
    const kv = createUnavailableKv();
    for (const op of ['get', 'set', 'sAdd', 'scanKeys', 'hGetAll']) {
      const err = await kv[op]('k').catch(e => e);
      expect(err).toBeInstanceOf(StorageUnavailableError);
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('storage_unavailable');
    }
  });

  test('is not mistaken for a promise', async () => {
    const kv = createUnavailableKv();
    await expect(Promise.resolve(kv)).resolves.toBe(kv);
  });
});

describe.each(KV_CLIENTS)('%s', modulePath => {
  test('a preview deployment never connects to REDIS_URL', async () => {
    const { kv } = loadKv(modulePath, {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      REDIS_URL: 'redis://prod',
    });
    expect(mockCreateClient).not.toHaveBeenCalled();
    await expect(kv.get('admin:set')).rejects.toMatchObject({
      code: 'storage_unavailable',
      statusCode: 503,
    });
  });

  test('a preview deployment uses PREVIEW_REDIS_URL when set', () => {
    loadKv(modulePath, {
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      REDIS_URL: 'redis://prod',
      PREVIEW_REDIS_URL: 'redis://preview',
    });
    expect(mockCreateClient).toHaveBeenCalledWith({ url: 'redis://preview' });
  });

  test('production uses REDIS_URL', () => {
    loadKv(modulePath, {
      VERCEL: '1',
      VERCEL_ENV: 'production',
      REDIS_URL: 'redis://prod',
      PREVIEW_REDIS_URL: 'redis://preview',
    });
    expect(mockCreateClient).toHaveBeenCalledWith({ url: 'redis://prod' });
  });

  test('local dev with REDIS_URL behaves as before', () => {
    loadKv(modulePath, { REDIS_URL: 'redis://localhost:6379' });
    expect(mockCreateClient).toHaveBeenCalledWith({
      url: 'redis://localhost:6379',
    });
  });

  test('local dev without REDIS_URL uses the in-memory store', async () => {
    const { kv, isDevelopment } = loadKv(modulePath, {});
    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(isDevelopment).toBe(true);
    await kv.set('a', '1');
    await expect(kv.get('a')).resolves.toBe('1');
  });
});
