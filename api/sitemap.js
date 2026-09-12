/**
 * GET /sitemap.xml  (rewritten to /api/sitemap in vercel.json)
 *
 * ⚠️ IT HAS TO BE A FUNCTION, NOT A FILE IN `public/`. The pages worth
 * indexing here are the app pages, and there is no build-time list of them —
 * they come from whatever has been published. A static sitemap would name five
 * routes and go stale the first time somebody pushes a bundle.
 *
 * ⚠️ WHAT GOES IN IS EXACTLY WHAT BROWSE SHOWS. The entries come from the same
 * `listBundleManifests` + `buildBundleListing` pair behind GET /api/v2/bundles,
 * so a package is listed here if and only if it is already publicly reachable
 * through Explore — yanked versions are excluded by the same default. Deriving
 * the list any other way is how a sitemap ends up advertising something the
 * site itself declines to show.
 *
 * The origin is read from the request rather than hardcoded: this registry is
 * self-hostable, and a sitemap that points a private deployment's crawler at
 * apps.calimero.network is worse than none.
 */

const {
  BundleStorageKV,
} = require('@calimero-network/registry-backend/src/lib/bundle-storage-kv');
const { kv } = require('@calimero-network/registry-backend/src/lib/kv-client');
const {
  buildBundleListing,
} = require('@calimero-network/registry-backend/src/lib/bundle-listing');

/** Everything a crawler should reach that is not behind a session. */
const STATIC_ROUTES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/explore', changefreq: 'daily', priority: '0.9' },
  { path: '/developers', changefreq: 'weekly', priority: '0.6' },
  { path: '/docs', changefreq: 'monthly', priority: '0.7' },
  { path: '/upload', changefreq: 'monthly', priority: '0.4' },
];

let storage;
function getStorage() {
  if (!storage) storage = new BundleStorageKV();
  return storage;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function originFrom(req) {
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  if (!host) return 'https://apps.calimero.network';
  const proto = req.headers?.['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

/** `<lastmod>` is a date, and an unparseable one invalidates the whole entry. */
function toLastmod(value) {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at.toISOString().slice(0, 10);
}

function renderUrl({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : null,
    priority ? `    <priority>${priority}</priority>` : null,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildSitemap(origin, packages) {
  const urls = [
    ...STATIC_ROUTES.map(r => ({ ...r, loc: `${origin}${r.path}` })),
    ...packages.map(p => ({
      // Package ids are reverse-DNS (`com.calimero.mero-chat`), so the only
      // characters in play are already URL-safe — but they are user input, and
      // encoding is what keeps a malformed id from breaking the document.
      loc: `${origin}/apps/${encodeURIComponent(p.id)}`,
      lastmod: toLastmod(p.publishedAt),
      changefreq: 'weekly',
      priority: '0.8',
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(renderUrl).join('\n')}
</urlset>
`;
}

/** Latest published version per package, newest publish date first. */
async function listPackages() {
  const entries = await getStorage().listBundleManifests({
    package: null,
    allVersions: false,
    includeYanked: false,
  });
  const bundles = await buildBundleListing({ entries, kv });

  const seen = new Set();
  const packages = [];
  for (const bundle of bundles) {
    const id = bundle?.package;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    packages.push({ id, publishedAt: bundle?.publishedAt ?? null });
  }
  return packages;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const origin = originFrom(req);

  let packages = [];
  try {
    packages = await listPackages();
  } catch (error) {
    // ⚠️ A SITEMAP THAT 500s IS WORSE THAN A SHORT ONE. Search Console treats
    // an error as "could not read", drops the whole document and keeps the
    // last good copy; answering with the five static routes at least keeps the
    // shell of the site indexed while the store is unreachable.
    console.error('Sitemap listing error:', error);
  }

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400'
  );
  return res.status(200).send(buildSitemap(origin, packages));
};

module.exports.buildSitemap = buildSitemap;
module.exports.escapeXml = escapeXml;
module.exports.originFrom = originFrom;
module.exports.toLastmod = toLastmod;
module.exports.STATIC_ROUTES = STATIC_ROUTES;
