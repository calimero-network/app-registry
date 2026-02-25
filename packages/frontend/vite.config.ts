import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Plugin: rewrite SPA routes that contain dots to /index.html.
// Vite 4's historyApiFallback dot-rule override is unreliable; this inline
// middleware runs first and explicitly handles package-name paths like
// /apps/com.calimero.kv-store on hard refresh.
const spaFallback: Plugin = {
  name: 'spa-fallback',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url ?? '/';
      // Pass through: Vite internals, API proxy, and real static assets
      if (
        url.startsWith('/@') ||
        url.startsWith('/api') ||
        /\.(js|ts|jsx|tsx|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|json|wasm|map)(\?|$)/.test(
          url
        )
      ) {
        return next();
      }
      // Everything else (including dot-containing SPA paths) → serve index.html
      req.url = '/';
      next();
    });
  },
};

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), spaFallback],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['@calimero-network/mero-icons'],
  },
  server: {
    port: parseInt(process.env.VITE_PORT || '3000'),
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
