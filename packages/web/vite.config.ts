/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { seoPlugin } from './vite-plugin-seo.js';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    seoPlugin(
      [
        {
          path: '/imprint',
          title: 'Legal Notice — City Monitor',
          description: 'Legal notice and contact information for City Monitor.',
        },
        {
          path: '/privacy',
          title: 'Privacy Policy — City Monitor',
          description: 'Privacy policy for City Monitor. No cookies, no tracking, no analytics.',
        },
        {
          path: '/no-ads-no-tracking',
          title: 'No Ads, No Tracking — City Monitor',
          description: 'City Monitor is free, open source, and respects your privacy. No ads, no tracking, no cookies.',
        },
        {
          path: '/berlin',
          title: 'City Monitor — Berlin',
          description: 'Real-time Berlin dashboard: news, weather, transit, events, water levels, and more.',
          ogImage: 'og-berlin.png',
        },
        {
          path: '/hamburg',
          title: 'City Monitor — Hamburg',
          description: 'Real-time Hamburg dashboard: news, weather, transit, events, tidal levels, and more.',
          ogImage: 'og-hamburg.png',
        },
        {
          path: '/berlin/sources',
          title: 'Data Sources — City Monitor Berlin',
          description: 'All data sources used by City Monitor for Berlin.',
          ogImage: 'og-berlin.png',
        },
        {
          path: '/hamburg/sources',
          title: 'Data Sources — City Monitor Hamburg',
          description: 'All data sources used by City Monitor for Hamburg.',
          ogImage: 'og-hamburg.png',
        },
      ],
      'https://citymonitor.app',
    ),
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          'maplibre': ['maplibre-gl'],
          'react-vendor': ['react', 'react-dom'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:3001' },
  },
});
