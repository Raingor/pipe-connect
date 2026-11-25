import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 5309, strictPort: true },
  preview: { port: 4309, strictPort: true },
});
