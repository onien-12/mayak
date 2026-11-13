import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { serviceWorker } from './pwa/serviceWorkerPlugin';

/** Dev proxy target; override with `BACKEND_URL=http://localhost:9000 npm run dev`. */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8000';

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': BACKEND_URL,
      '/media': BACKEND_URL,
    },
  },
});
