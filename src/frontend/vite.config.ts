import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  server: { host: '127.0.0.1', port: 34115, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
