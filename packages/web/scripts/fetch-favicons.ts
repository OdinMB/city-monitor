/**
 * Download favicons for news sources and save them locally.
 * Run: npx tsx packages/web/scripts/fetch-favicons.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const FAVICON_SOURCES: Record<string, string> = {
  // Berlin
  rbb24: 'www.rbb24.de',
  tagesspiegel: 'www.tagesspiegel.de',
  'berliner-morgenpost': 'www.morgenpost.de',
  'berliner-zeitung': 'www.berliner-zeitung.de',
  'polizei-berlin': 'www.berlin.de',
  gruenderszene: 'www.businessinsider.de',
  // Hamburg
  'ndr-hamburg': 'www.ndr.de',
  mopo: 'www.mopo.de',
  'feuerwehr-hamburg': 'www.presseportal.de',
  // Köln
  'wdr-rheinland': 'www1.wdr.de',
  'koelner-stadt-anzeiger': 'www.ksta.de',
  express: 'www.express.de',
  // Google has no icon for www.stadt-koeln.de (404, default globe); the bare domain has the coat of arms.
  'stadt-koeln': 'stadt-koeln.de',
  // München
  'br24-oberbayern': 'www.br.de',
  'rathaus-umschau': 'www.muenchen.de',
  'feuerwehr-muenchen': 'www.presseportal.de',
};

const OUT_DIR = join(import.meta.dirname, '..', 'public', 'favicons');

async function fetchFavicon(key: string, domain: string) {
  const url = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  FAIL ${key}: ${res.status}`);
    return;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = join(OUT_DIR, `${key}.png`);
  writeFileSync(outPath, buf);
  console.log(`  OK   ${key} (${buf.length} bytes)`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log('Fetching favicons...');
  for (const [key, domain] of Object.entries(FAVICON_SOURCES)) {
    await fetchFavicon(key, domain);
  }
  console.log('Done.');
}

main();
