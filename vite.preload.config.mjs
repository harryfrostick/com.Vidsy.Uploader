import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.vite/build',
    lib: {
      entry: 'preload.js',
      name: 'preload',
      fileName: 'preload',
      formats: ['cjs'],
    },
  },
});