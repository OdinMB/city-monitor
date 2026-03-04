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
  'bz-berlin': 'www.bz-berlin.de',
  'berlin-de-news': 'www.berlin.de',
  'berliner-zeitung': 'www.berliner-zeitung.de',
  'taz-berlin': 'taz.de',
  exberliner: 'www.exberliner.com',
  gruenderszene: 'www.businessinsider.de',
  // Hamburg
  'ndr-hamburg': 'www.ndr.de',
  'hamburger-abendblatt': 'www.abendblatt.de',
  mopo: 'www.mopo.de',
  'hamburg-de-news': 'www.hamburg.de',
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
