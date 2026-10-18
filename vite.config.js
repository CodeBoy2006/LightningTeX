import { defineConfig } from 'vite';
import {packageNotices} from './scripts/package-notices.mjs';
export default defineConfig({
  base: './',
  server: { headers: {'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'} },
  preview: { headers: {'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'} },
  plugins:[{name:'distribution-notices',writeBundle:({dir})=>packageNotices(dir)}],
  build: { target:'es2022', rollupOptions:{input:'ui/index.html'}, outDir:'dist', emptyOutDir:true }
});
