import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WebCityConfig } from '@city-monitor/shared';
import { CITY_META, seoPages } from './seo-pages';
import { getAllCities } from '../config/index';
import { berlin } from '../config/cities/berlin';
import { hamburg } from '../config/cities/hamburg';
import { koeln } from '../config/cities/koeln';
import { muenchen } from '../config/cities/muenchen';

const anyImage = () => true;

describe('seoPages', () => {
  it('builds the same pages as before for Berlin and Hamburg', () => {
    const pages = seoPages([berlin, hamburg], anyImage);

    expect(pages.map((p) => p.path)).toEqual([
      '/', '/imprint', '/privacy', '/no-ads-no-tracking', '/berlin', '/hamburg', '/berlin/sources', '/hamburg/sources',
    ]);
    expect(pages[0]!.description).toBe(
      'Real-time dashboards for Berlin and Hamburg from open data: news, weather, warnings, water levels and more.',
    );
    expect(pages.find((p) => p.path === '/hamburg')).toEqual({
      path: '/hamburg',
      title: 'City Monitor — Hamburg',
      description: 'Real-time Hamburg dashboard: news, police reports, weather, air quality, Elbe tidal levels, and more.',
      ogImage: 'og-hamburg.png',
      dashboard: true,
    });
    expect(pages.filter((p) => p.dashboard).map((p) => p.path)).toEqual(['/', '/berlin', '/hamburg']);
  });

  it('builds no page for an inactive city, and both of its pages once it is active', () => {
    expect(seoPages([berlin, hamburg], anyImage).some((p) => p.path.startsWith('/koeln'))).toBe(false);

    const pages = seoPages([berlin, hamburg, koeln, muenchen], anyImage);
    expect(pages[0]!.description).toContain('for Berlin, Hamburg, Köln, and München from open data');
    expect(pages.find((p) => p.path === '/muenchen/sources')).toMatchObject({
      title: 'Data Sources — City Monitor München',
      ogImage: 'og-muenchen.png',
    });
  });

  it('has meta waiting for every configured city', () => {
    for (const city of [berlin, hamburg, koeln, muenchen]) expect(Object.hasOwn(CITY_META, city.id)).toBe(true);
  });

  it('refuses an active city without meta or without its share image', () => {
    const teststadt = { ...koeln, id: 'teststadt', name: 'Teststadt' } satisfies WebCityConfig;

    expect(() => seoPages([berlin, teststadt], anyImage)).toThrow(/CITY_META/);
    expect(() => seoPages([berlin, koeln], (file) => file !== 'og-koeln.png')).toThrow(/og-koeln\.png/);
  });

  it('finds the share image of every active city in public/', () => {
    const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../public');
    const inPublic = (file: string) => existsSync(resolve(publicDir, file));

    expect(() => seoPages(getAllCities(), inPublic)).not.toThrow();
  });
});
