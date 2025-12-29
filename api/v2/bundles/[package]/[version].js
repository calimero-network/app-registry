/**
 * V2 Bundle Manifest API
 * GET /api/v2/bundles/:package/:version
 */

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
    return res.status(200).end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { package: pkg, version } = req.query;
    if (!pkg || !version)
      return res.status(400).json({ error: 'missing_params' });

    const { kv } = require('../../../../packages/backend/src/lib/kv-client');
    const data = await kv.get(`bundle:${pkg}/${version}`);
    if (!data) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json(JSON.parse(data).json);
  } catch (error) {
    console.error('Get Error:', error);
    return res
      .status(500)
      .json({ error: 'internal_error', message: error.message });
  }
};
