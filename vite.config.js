import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { headers: {'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'} },
  preview: { headers: {'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'} },
  build: { target:'es2022', rollupOptions:{input:'ui/index.html'}, outDir:'dist', emptyOutDir:true }
});
