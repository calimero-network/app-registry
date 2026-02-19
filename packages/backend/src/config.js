module.exports = {
  ipfs: {
    gateways: process.env.IPFS_GATEWAYS
      ? process.env.IPFS_GATEWAYS.split(',')
      : [
          'https://ipfs.io/ipfs/',
          'https://gateway.pinata.cloud/ipfs/',
          'https://cloudflare-ipfs.com/ipfs/',
        ],
  },
  cors: {
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',')
      : [
          'https://calimero-network.github.io',
          'http://localhost:5173',
          'http://localhost:1420',
          'http://localhost:3000',
          'http://localhost:8080',
          'tauri://localhost', // Tauri apps
          'https://tauri.localhost', // Tauri apps
        ],
  },
  cdn: {
    headers: {
      'Cache-Control': 'public, max-age=3600',
      'CDN-Cache-Control': 'public, max-age=86400',
      Vary: 'Accept-Encoding',
    },
  },
  server: {
    port: process.env.PORT || 8080,
    host: process.env.HOST || '0.0.0.0',
  },
  auth: {
    sessionSecret: (() => {
      if (!process.env.SESSION_SECRET) {
        if (process.env.NODE_ENV === 'production') {
          throw new Error('SESSION_SECRET environment variable is required in production');
        }
        console.warn('[config] SESSION_SECRET not set — using insecure default (dev only)');
        return 'change-me-in-production-session-secret';
      }
      return process.env.SESSION_SECRET;
    })(),
    frontendUrl:
      process.env.FRONTEND_URL || 'http://localhost:3000',
    cookieName: process.env.AUTH_COOKIE_NAME || 'app_registry_session',
    cookieMaxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
  },
};
