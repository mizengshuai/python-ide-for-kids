import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const jupyterPort = process.env.XM_JUPYTER_PORT || '8899';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/jupyter': {
        target: `http://127.0.0.1:${jupyterPort}`,
        ws: true,
        rewrite: (p) => p.replace(/^\/jupyter/, ''),
      },
    },
  },
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000 },
});
