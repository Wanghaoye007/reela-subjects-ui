import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [svgr(), tailwindcss()],
  resolve: { alias: { '~': fileURLToPath(new URL('../app', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  server: {
    host: '127.0.0.1',
    port: 8918,
    strictPort: true,
    fs: { allow: [fileURLToPath(new URL('../../../..', import.meta.url))] },
  },
  build: { outDir: '../dist-local-preview', emptyOutDir: true },
});
