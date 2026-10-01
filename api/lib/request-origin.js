const {
  parseCookies,
  sessionCookieName,
  refreshCookieName,
} = require('@calimero-network/registry-shared/session-cookies');

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const DEFAULT_FRONTEND_URL = 'https://apps.calimero.network';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

const CROSS_ORIGIN_FORBIDDEN = Object.freeze({
  error: 'forbidden_origin',
  message:
    'Cookie-authenticated requests that change state must come from the registry site',
});

function originOf(value) {
  if (typeof value !== 'string' || value === '' || value === 'null') {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function firstHeader(value) {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== 'string') return '';
  return v.split(',')[0].trim();
}

function isLocalDevelopment() {
  const env = process.env.VERCEL_ENV;
  return !env || env === 'development';
}

function isLocalOrigin(origin) {
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname);
  } catch {
    return false;
  }
}

function allowedOrigins(req) {
  const allowed = new Set();
  const add = value => {
    const o = originOf(value);
    if (o) allowed.add(o);
  };
  add(process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL);
  for (const name of [
    'VERCEL_URL',
    'VERCEL_BRANCH_URL',
    'VERCEL_PROJECT_PRODUCTION_URL',
  ]) {
    const host = process.env[name];
    if (host) add(`https://${host}`);
  }
  const host =
    firstHeader(req.headers?.['x-forwarded-host']) ||
    firstHeader(req.headers?.host);
  if (host) add(`https://${host}`);
  return allowed;
}

function requestOrigin(req) {
  const headers = req.headers || {};
  const origin = firstHeader(headers.origin);
  if (origin) return originOf(origin);
  return originOf(firstHeader(headers.referer));
}

function isStateChanging(req) {
  return STATE_CHANGING.has(String(req.method || '').toUpperCase());
}

function isSameOriginRequest(req) {
  const origin = requestOrigin(req);
  if (!origin) return false;
  if (allowedOrigins(req).has(origin)) return true;
  return isLocalDevelopment() && isLocalOrigin(origin);
}

function carriesAuthCookie(req) {
  const cookies = parseCookies(req.headers?.cookie);
  return Boolean(cookies[sessionCookieName()] || cookies[refreshCookieName()]);
}

function cookieWriteAllowed(req) {
  return !isStateChanging(req) || isSameOriginRequest(req);
}

function isCrossOriginCookieWrite(req) {
  return carriesAuthCookie(req) && !cookieWriteAllowed(req);
}

function rejectCrossOriginCookieWrite(req, res) {
  if (!isCrossOriginCookieWrite(req)) return false;
  res.status(403).json(CROSS_ORIGIN_FORBIDDEN);
  return true;
}

module.exports = {
  CROSS_ORIGIN_FORBIDDEN,
  allowedOrigins,
  requestOrigin,
  isStateChanging,
  isSameOriginRequest,
  cookieWriteAllowed,
  isCrossOriginCookieWrite,
  rejectCrossOriginCookieWrite,
};
