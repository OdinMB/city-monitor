import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { existsSync } from 'node:fs';
import { seoPlugin } from './vite-plugin-seo.js';
import { apiOrigin, resolveApiBase } from './src/lib/api-base.js';
import { seoPages } from './src/lib/seo-pages.js';
import { getAllCities } from './src/config/index.js';

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
    // Pages for the active cities only: a city's meta waits in CITY_META until it is activated.
    seoPlugin(
      seoPages(getAllCities(), (file) => existsSync(new URL(`./public/${file}`, import.meta.url))),
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
