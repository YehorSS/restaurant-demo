import { defineConfig } from 'vite';

export default defineConfig({
  root: __dirname,
  base: '/restaurant-demo/zhar/',
  build: { outDir: '../dist-pages/restaurant-demo/zhar', emptyOutDir: true },
  server: { port: 5174, strictPort: true },
  preview: { port: 5174, strictPort: true },
});
