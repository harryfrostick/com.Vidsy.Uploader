import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.vite/build',
    lib: {
      entry: 'main.js',
      name: 'main',
      fileName: 'main',
      formats: ['cjs'],
    },
    rollupOptions: {
      external: ['electron', 'path', 'fs', 'chokidar', 'electron-store'],
    },
  },
});