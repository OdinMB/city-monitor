import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CityConfig } from '@city-monitor/shared';
import { FAVICON_SLUGS, sourceFaviconUrl } from './news-favicons';

const here = dirname(fileURLToPath(import.meta.url));
const CITIES_DIR = resolve(here, '../../../server/src/config/cities');
const PUBLIC_DIR = resolve(here, '../../public');

/** Every feed name in the server's city configs, all cities, active or not. */
async function configuredFeedNames(): Promise<string[]> {
  const files = readdirSync(CITIES_DIR).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const names: string[] = [];
  for (const file of files) {
    const mod = (await import(/* @vite-ignore */ resolve(CITIES_DIR, file))) as Record<string, CityConfig>;
    for (const city of Object.values(mod)) names.push(...city.feeds.map((feed) => feed.name));
  }
  return names;
}

describe('news source favicons', () => {
  let feedNames: string[];

  beforeAll(async () => {
    feedNames = await configuredFeedNames();
  });

  it('reads the feeds of both cities', () => {
    expect(feedNames).toContain('rbb24');
    expect(feedNames).toContain('NDR Hamburg');
  });

  it('has an icon for every configured feed', () => {
    expect(feedNames.filter((name) => sourceFaviconUrl(name) === null)).toEqual([]);
  });

  it('lists only configured feeds', () => {
    expect(Object.keys(FAVICON_SLUGS).filter((name) => !feedNames.includes(name))).toEqual([]);
  });

  it('points every entry at a bundled file', () => {
    const missing = Object.values(FAVICON_SLUGS).filter(
      (slug) => !existsSync(resolve(PUBLIC_DIR, 'favicons', `${slug}.png`)),
    );
    expect(missing).toEqual([]);
  });

  it('gives Polizei Berlin its icon', () => {
    expect(sourceFaviconUrl('Polizei Berlin')).toBe('/favicons/polizei-berlin.png');
  });

  it('shows no icon for an unknown source', () => {
    expect(sourceFaviconUrl('Unknown Feed')).toBeNull();
  });
});
