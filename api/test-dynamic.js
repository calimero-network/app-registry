// Test endpoint to verify dynamic routing works
module.exports = async (req, res) => {
  const { id } = req.query;
  return res.status(200).json({
    message: 'Dynamic routing test',
    receivedId: id || 'none',
    path: req.url,
    query: req.query,
  });
};
