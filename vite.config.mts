import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  define: {
    __SAFE_PWA_ENABLED__: JSON.stringify(command === 'build'),
  },
  plugins: [react()],
  root: 'src/presentation',
  publicDir: '../../public',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5176,
    strictPort: true,
    open: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
}));
