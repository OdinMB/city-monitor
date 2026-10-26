import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { seoPlugin } from './vite-plugin-seo.js';
import { apiOrigin, resolveApiBase } from './src/lib/api-base.js';

/**
 * Preconnect to the API's origin when VITE_API_BASE points the app at another
 * host. With the default same-origin '/api' there is nothing to add.
 */
function apiPreconnect(base: string): Plugin {
  const origin = apiOrigin(base);
  return {
    name: 'api-preconnect',
    transformIndexHtml: () =>
      origin ? [{ tag: 'link', attrs: { rel: 'preconnect', href: origin, crossorigin: true }, injectTo: 'head' }] : [],
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    apiPreconnect(resolveApiBase(loadEnv(mode, process.cwd(), 'VITE_').VITE_API_BASE)),
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
          description: 'Privacy policy for City Monitor. No cookies, no user tracking, privacy-friendly analytics.',
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
}));
