/**
 * Builds the web app for one run, as
 *   node harness/lib/web-build.mjs <guard-file>
 * with the environment the parent cleared. The config is inline, not
 * packages/web/vite.config.ts, which loads .env files from the working folder,
 * proxies /api to localhost:3001 and writes per-route pages into dist/. Here:
 * no .env file is read (envDir: false), the output and Vite's cache go under
 * the run, and `shared` resolves to its sources. VITE_API_BASE
 * stays unset, so the app calls /api on its own origin: the harness's server.
 */

import fs from 'node:fs';
import { assertGuard, GuardError } from './guard.mjs';
import { MARKERS } from './processes.mjs';
import { REPO } from './paths.mjs';

function refuse(problem) {
  console.error(problem instanceof GuardError ? problem.message : `hermetic-guard: refused: ${problem}`);
  process.exit(2);
}

const [guardFile] = process.argv.slice(2);
if (!guardFile) refuse('usage: web-build.mjs <guard-file>');
const spec = JSON.parse(fs.readFileSync(guardFile, 'utf8'));
try {
  assertGuard(process.env, { expected: spec.expected });
} catch (err) {
  refuse(err);
}
console.log(`${MARKERS.guardOk} web-build`);

const { build } = await import('vite');
const { default: react } = await import('@vitejs/plugin-react');
const { default: tailwindcss } = await import('@tailwindcss/vite');

await build({
  configFile: false,
  root: REPO.web,
  envDir: false, // no .env files at all

  cacheDir: spec.viteCacheDir,
  mode: 'production',
  logLevel: 'warn',
  clearScreen: false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@city-monitor\/shared\/schemas\.js$/, replacement: `${REPO.shared}/schemas.ts` },
      { find: /^@city-monitor\/shared$/, replacement: `${REPO.shared}/types.ts` },
    ],
  },
  build: {
    outDir: spec.webOutDir,
    emptyOutDir: true,
    target: 'esnext',
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          'react-vendor': ['react', 'react-dom'],
          'query-vendor': ['@tanstack/react-query'],
        },
      },
    },
  },
});
