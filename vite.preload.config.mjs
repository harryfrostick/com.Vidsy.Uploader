import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: '.vite/build',
    lib: {
      entry: 'preload.js', // This points to your preload.js file
      formats: ['cjs'],
    },
  },
});