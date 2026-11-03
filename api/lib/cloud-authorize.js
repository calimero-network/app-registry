/**
 * Client for the Cloud manager's (mdma) download authorization endpoint.
 *
 * Calimero nodes fetch a private package with ONE GET carrying the cluster's
 * credential as HTTP basic auth (userinfo in `--registry-url`), and they
 * refuse redirects — so the registry cannot hand out signed URLs and must
 * check that credential itself. It does so by asking mdma, which owns the
 * per-cluster credentials:
 *
 *   POST CLOUD_AUTHORIZE_URL
 *   X-Registry-Timestamp: <unix seconds>
 *   X-Registry-Signature: sha256=<hex HMAC-SHA256(secret, "<ts>.<raw body>")>
 *   { "cluster_user", "token", "package", "version", "org" }
 *   -> 200 { "allowed": boolean, "org_id": string | null }
 *
 * The full contract is docs/cloud-integration.md.
 *
 * Answers are cached per function instance: allowed for 60 s, denied for
 * 10 s. Errors and timeouts are never cached. The cache key is a hash, so the
 * cluster token is never held in memory as a map key.
 */

const crypto = require('crypto');
const { storageVar } = require('@calimero-network/registry-shared/storage-env');

const POSITIVE_TTL_MS = 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 1000;
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_CACHE_ENTRIES = 5000;
const SIGNATURE_SCHEME = 'sha256';
const WEBHOOK_TIMEOUT_MS = 2000;

const cache = new Map();

class AuthorizeUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizeUnavailableError';
    this.code = 'authorize_unavailable';
  }
}

function authorizeConfig() {
  const url = storageVar('CLOUD_AUTHORIZE_URL');
  const secret = storageVar('CLOUD_AUTHORIZE_HMAC_SECRET');
  if (!url || !secret) return null;
  const timeout = Number(storageVar('CLOUD_AUTHORIZE_TIMEOUT_MS'));
  return {
    url,
    secret,
    timeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

/** The signature mdma verifies. Exported for tests and for the mdma side. */
function signRequest(secret, timestamp, rawBody) {
  const mac = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `${SIGNATURE_SCHEME}=${mac}`;
}

/**
 * Parse `Authorization: Basic base64(user:pass)`.
 * @returns {{user: string, pass: string} | null}
 */
function parseBasicAuth(header) {
  if (typeof header !== 'string') return null;
  const m = /^basic\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(header);
  if (!m) return null;
  let decoded;
  try {
    decoded = Buffer.from(m[1], 'base64').toString('utf8');
  } catch {
    return null;
  }
  const i = decoded.indexOf(':');
  if (i <= 0) return null;
  const user = decoded.slice(0, i);
  const pass = decoded.slice(i + 1);
  if (!user || !pass || user.length > 256 || pass.length > 1024) return null;
  // userinfo is percent-encoded in a URL; curl and reqwest decode it before
  // building the header, but be lenient with a client that did not.
  const decode = s => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  return { user: decode(user), pass: decode(pass) };
}

function cacheKey(clusterUser, token, pkg, version, org) {
  return crypto
    .createHash('sha256')
    .update([clusterUser, token, pkg, version, org || ''].join('\0'))
    .digest('hex');
}

function cacheGet(key, now) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expires <= now) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value, ttl, now) {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    // Map iterates in insertion order: drop the oldest entry.
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { value, expires: now + ttl });
}

/**
 * Ask mdma whether a cluster credential may download `pkg@version`.
 *
 * @returns {Promise<{allowed: boolean, orgId: string|null, cached: boolean}>}
 * @throws {AuthorizeUnavailableError} when not configured, on timeout, network
 *   error, non-200 or a malformed answer. Callers fail closed.
 */
async function authorizeDownload(
  { clusterUser, token, pkg, version, org = null },
  { fetchImpl = globalThis.fetch, now = Date.now } = {}
) {
  const config = authorizeConfig();
  if (!config) throw new AuthorizeUnavailableError('authorize not configured');

  const key = cacheKey(clusterUser, token, pkg, version, org);
  const cached = cacheGet(key, now());
  if (cached) return { ...cached, cached: true };

  const body = JSON.stringify({
    cluster_user: clusterUser,
    token,
    package: pkg,
    version,
    // The owning Cloud org the registry has recorded; mdma checks it agrees.
    ...(org ? { org } : {}),
  });
  const timestamp = String(Math.floor(now() / 1000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response;
  try {
    response = await fetchImpl(config.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Registry-Timestamp': timestamp,
        'X-Registry-Signature': signRequest(config.secret, timestamp, body),
      },
      body,
      signal: controller.signal,
      redirect: 'error',
    });
  } catch (err) {
    throw new AuthorizeUnavailableError(
      `authorize request failed: ${err?.name === 'AbortError' ? 'timeout' : err?.message}`
    );
  } finally {
    clearTimeout(timer);
  }

  if (response.status !== 200) {
    throw new AuthorizeUnavailableError(
      `authorize answered ${response.status}`
    );
  }
  let data;
  try {
    data = await response.json();
  } catch {
    throw new AuthorizeUnavailableError('authorize answered non-JSON');
  }
  if (typeof data?.allowed !== 'boolean') {
    throw new AuthorizeUnavailableError('authorize answer lacks "allowed"');
  }
  const value = {
    allowed: data.allowed,
    orgId: typeof data.org_id === 'string' && data.org_id ? data.org_id : null,
  };
  cacheSet(
    key,
    value,
    value.allowed ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS,
    now()
  );
  return { ...value, cached: false };
}

/**
 * The publish notification URL: CLOUD_PUBLISHED_URL, else the authorize URL
 * with its last path segment replaced (`.../authorize` -> `.../published`).
 */
function publishedUrl() {
  const explicit = storageVar('CLOUD_PUBLISHED_URL');
  if (explicit) return explicit;
  const authorize = storageVar('CLOUD_AUTHORIZE_URL');
  if (!authorize) return null;
  try {
    const url = new URL(authorize);
    url.pathname = url.pathname.replace(/\/[^/]*$/, '/published');
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Tell the Cloud manager a version of a Cloud-org package was published
 * (whoever published it: the console through mdma, or CI straight to the
 * registry with an API-key JWT). Signed like the authorize call.
 *
 *   POST {MDMA}/internal/registry/published
 *   { package, version, org, visibility, manifest_digest, bundle_digest,
 *     signer, published_at, via }
 *
 * Best effort: awaited (a Vercel function may be frozen once it answers) but
 * bounded by a short timeout, and never fails the publish. mdma must treat it
 * as idempotent: the same (package, version) can arrive more than once.
 *
 * @returns {Promise<boolean>} whether mdma answered 2xx
 */
async function notifyPublished(
  event,
  { fetchImpl = globalThis.fetch, now = Date.now } = {}
) {
  const url = publishedUrl();
  const secret = storageVar('CLOUD_AUTHORIZE_HMAC_SECRET');
  if (!url || !secret || !event?.org) return false;
  const body = JSON.stringify(event);
  const timestamp = String(Math.floor(now() / 1000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Registry-Timestamp': timestamp,
        'X-Registry-Signature': signRequest(secret, timestamp, body),
      },
      body,
      signal: controller.signal,
      redirect: 'error',
    });
    if (response.status < 200 || response.status >= 300) {
      console.error('publish webhook answered', response.status, event.package);
      return false;
    }
    return true;
  } catch (err) {
    console.error('publish webhook failed', event.package, err?.message);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function _clearAuthorizeCache() {
  cache.clear();
}

module.exports = {
  authorizeDownload,
  notifyPublished,
  publishedUrl,
  parseBasicAuth,
  signRequest,
  AuthorizeUnavailableError,
  POSITIVE_TTL_MS,
  NEGATIVE_TTL_MS,
  _clearAuthorizeCache,
};
