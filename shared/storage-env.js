class StorageUnavailableError extends Error {
  constructor() {
    super(
      'Storage is not configured for this deployment environment; set the PREVIEW_* storage variables to use an isolated store'
    );
    this.name = 'StorageUnavailableError';
    this.code = 'storage_unavailable';
    this.statusCode = 503;
  }
}

function isNonProductionDeployment(env = process.env) {
  return Boolean(env.VERCEL_ENV) && env.VERCEL_ENV !== 'production';
}

function storageVar(name, env = process.env) {
  return isNonProductionDeployment(env) ? env[`PREVIEW_${name}`] : env[name];
}

function isStorageBlocked(env = process.env) {
  return isNonProductionDeployment(env) && !storageVar('REDIS_URL', env);
}

function createUnavailableKv() {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return undefined;
        return async () => {
          throw new StorageUnavailableError();
        };
      },
    }
  );
}

module.exports = {
  StorageUnavailableError,
  isNonProductionDeployment,
  storageVar,
  isStorageBlocked,
  createUnavailableKv,
};
