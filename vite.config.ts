import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

// Deployed to GitHub Pages under https://<user>.github.io/tileswitch/, so the
// production base path is the repo name. Dev stays at '/'.
const base = process.env.NODE_ENV === 'production' ? '/tileswitch/' : '/';

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      // Two independent HTML entries. The app and the kinetic-typography
      // trailer (served at /trailer/) are fully code-split: visiting one never
      // downloads the other's bundle. See trailer/README-inline notes.
      input: {
        main: resolve(__dirname, 'index.html'),
        trailer: resolve(__dirname, 'trailer/index.html'),
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      devOptions: {
        // Let the service worker run under `vite dev` so the PWA is testable.
        enabled: true,
      },
      workbox: {
        // Precache the built assets so the app works fully offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'TileSwitch',
        short_name: 'TileSwitch',
        description: 'Swap the tiles to rebuild the picture.',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        // Unlocked: wide (e.g. 16:9) puzzles are badly cramped on a portrait
        // phone, so the installed app follows the device orientation and the
        // board re-fits on rotate. See renderGame's refit handler.
        orientation: 'any',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
});
