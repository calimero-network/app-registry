/**
 * Health Check Endpoint
 * GET /api/healthz
 */

module.exports = async (req, res) => {
  return res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
};
