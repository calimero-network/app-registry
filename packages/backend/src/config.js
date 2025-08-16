module.exports = {
  ipfs: {
    gateways: process.env.IPFS_GATEWAYS
      ? process.env.IPFS_GATEWAYS.split(',')
      : [
        'https://ipfs.io/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/'
      ]
  },
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : ['http://localhost:3000', 'https://registry.example.com']
  },
  cdn: {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'CDN-Cache-Control': 'public, max-age=86400',
      'Vary': 'Accept-Encoding'
    }
  },
  server: {
    port: process.env.PORT || 8080,
    host: process.env.HOST || '0.0.0.0'
  }
}; 