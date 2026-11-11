import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  base: '/restaurant-demo/lucciola/',
  build: { outDir: '../dist-pages/restaurant-demo/lucciola', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
