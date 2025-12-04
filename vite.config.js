// VITE BUILD CONFIGURATION
// This configures how the React app gets built
// 
// SETUP:
// - Source files are in: sidebar-src/
// - Built output goes to: sidebar/
// - Chrome extension loads from: sidebar/
//
// TO BUILD:
// Run: npm run build
// This compiles React JSX → JavaScript and outputs to sidebar/ folder

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
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true,
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'sidebar-src'),
      'tslib': resolve(__dirname, 'node_modules/@walletconnect/time/node_modules/tslib/tslib.js'),
    },
  },
  optimizeDeps: {
    include: ['tslib'],
  },
});
