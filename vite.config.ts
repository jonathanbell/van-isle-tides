/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages project-page base path. Drop or set to '/' if you add a custom domain.
const BASE = '/van-isle-tides/';

export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Van-Isle Tides',
        short_name: 'VI Tides',
        description: 'Offline-first tide heights for Vancouver Island',
        theme_color: '#0b0d10',
        background_color: '#fafaf5',
        display: 'standalone',
        orientation: 'portrait',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${BASE}index.html`,
        // IWLS caching is owned by the app layer via IndexedDB.
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});
