import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ARCH_REVIEW: In development, Vite proxies WebSocket connections to the
// wrangler dev server. The worker runs on localhost:8787 by default.
// In production, set VITE_WORKER_URL to the deployed Worker URL.
const WORKER_DEV_PORT = 8787;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy WebSocket connections to the worker
      '/r': {
        target: `ws://localhost:${WORKER_DEV_PORT}`,
        ws: true,
      },
      // Proxy HTTP requests to the worker (for room info checks)
      '/api': {
        target: `http://localhost:${WORKER_DEV_PORT}`,
        changeOrigin: true,
      },
    },
  },
});
