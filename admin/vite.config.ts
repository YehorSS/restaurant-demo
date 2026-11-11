import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// built into dist/admin so the Worker serves it at /admin/
export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: { outDir: 'dist/admin', emptyOutDir: true },
  server: { port: 5175, proxy: { '/api': 'http://localhost:8787' } },
});
