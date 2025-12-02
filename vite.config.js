import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  root: 'sidebar-src',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../sidebar',
    rollupOptions: {
      input: resolve(__dirname, 'sidebar-src/index.html'),
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    emptyOutDir: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'sidebar-src'),
    },
  },
});

