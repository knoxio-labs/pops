import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/trips-api': {
        target: process.env.TRIPS_DEV_API_ORIGIN ?? 'http://localhost:3018',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/trips-api/u, ''),
      },
    },
  },
});
