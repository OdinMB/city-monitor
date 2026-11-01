import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CityConfig, CityFeature, WebCityConfig } from '@city-monitor/shared';
import { getAllCities, getCityConfig, getDefaultCityId } from './index.js';
import { berlin } from './cities/berlin.js';
import { hamburg } from './cities/hamburg.js';
import { koeln } from './cities/koeln.js';
import { getNoiseWmsAttribution, getNoiseWmsUrl } from '../components/map/constants.js';

/** Features the web app holds itself, which the server knows nothing about. */
const WEB_ONLY_FEATURES: readonly CityFeature[] = ['crisis', 'rentMap', 'noiseMap', 'noiseTotal'];

const ALL_CONFIGURED = [berlin, hamburg, koeln];

describe('getDefaultCityId', () => {
  it('returns berlin with the shipped active cities', () => {
    expect(getDefaultCityId()).toBe('berlin');
  });

  it('prefers berlin while it is active, even when it is not listed first', () => {
    expect(getDefaultCityId([hamburg, berlin])).toBe('berlin');
  });

  it('returns the first active city when berlin is inactive', () => {
    expect(getDefaultCityId([hamburg])).toBe('hamburg');
    expect(getDefaultCityId([koeln, hamburg])).toBe('koeln');
  });
});

describe('active cities', () => {
  it('ships with Berlin as the only active city', () => {
    expect(getAllCities().map((c) => c.id)).toEqual(['berlin']);
    expect(getCityConfig('berlin')).toBe(berlin);
  });

  it('keeps Hamburg and Köln configured but inactive', () => {
    expect(getCityConfig('hamburg')).toBeUndefined();
    expect(getCityConfig('koeln')).toBeUndefined();
  });
});

describe('Köln config', () => {
  it('has its German name and time zone', () => {
    expect(koeln.id).toBe('koeln');
    expect(koeln.name).toBe('Köln');
    expect(koeln.country).toBe('DE');
    expect(koeln.timezone).toBe('Europe/Berlin');
    expect(koeln.languages).toEqual(['de', 'en']);
  });
});

describe('every configured city', () => {
  const cities = [berlin, hamburg, koeln];

  it('has its centre inside its bounding box', () => {
    for (const { id, coordinates: { lat, lon }, boundingBox: box } of cities) {
      expect(box.south < lat && lat < box.north, id).toBe(true);
      expect(box.west < lon && lon < box.east, id).toBe(true);
    }
  });

  // The map opens on these bounds and cannot pan beyond them (CityMap.tsx),
  // so a city without them would open nowhere.
  it('has map bounds that contain its bounding box', () => {
    for (const { id, map, boundingBox: box } of cities) {
      expect(map.bounds, id).toBeDefined();
      const [[west, south], [east, north]] = map.bounds!;
      expect(west <= box.west && south <= box.south, id).toBe(true);
      expect(east >= box.east && north >= box.north, id).toBe(true);
    }
  });
});

describe('web and server city configs', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const cityFiles = (dir: string) =>
    readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort();
  const WEB_DIR = resolve(here, 'cities');
  const SERVER_DIR = resolve(here, '../../../server/src/config/cities');

  async function load<T extends CityConfig | WebCityConfig>(dir: string, file: string): Promise<T> {
    const mod = (await import(/* @vite-ignore */ resolve(dir, file))) as Record<string, T>;
    return Object.values(mod)[0]!;
  }

  it('configure the same cities', () => {
    expect(cityFiles(WEB_DIR)).toEqual(cityFiles(SERVER_DIR));
  });

  // The two packages keep their own copy of each city; these fields must not drift apart.
  it('agree on the identity, place, time zone and languages of each city', async () => {
    for (const file of cityFiles(WEB_DIR)) {
      const web = await load<WebCityConfig>(WEB_DIR, file);
      const server = await load<CityConfig>(SERVER_DIR, file);
      const pick = ({ id, name, country, coordinates, boundingBox, timezone, languages }: CityConfig | WebCityConfig) =>
        ({ id, name, country, coordinates, boundingBox, timezone, languages });
      expect(pick(web), file).toEqual(pick(server));
    }
  });

  // The web app shows a tile or map layer only for a feature its config lists,
  // so a feature listed without data shows an empty tile, and one left out
  // hides data the server has.
  it('list exactly the features the server ingests for each city, besides the web app\'s own', async () => {
    // Loaded at run time, like the server's city files, so the web package's
    // type check stays out of the server's sources.
    const { cityFeatures } = (await import(/* @vite-ignore */ resolve(here, '../../../server/src/lib/city-features.ts'))) as {
      cityFeatures: (city: CityConfig) => CityFeature[];
    };
    for (const file of cityFiles(WEB_DIR)) {
      const web = await load<WebCityConfig>(WEB_DIR, file);
      const server = await load<CityConfig>(SERVER_DIR, file);
      const webIngested = web.features.filter((f) => !WEB_ONLY_FEATURES.includes(f));
      expect([...webIngested].sort(), file).toEqual(cityFeatures(server).sort());
    }
  });
});

describe('the web app\'s own features', () => {
  // The noise maps are WMS layers the browser loads from the city's own map
  // service (components/map/constants.ts).
  it.each(ALL_CONFIGURED.map((c) => [c.id, c] as const))('%s lists a noise map exactly when it has one', (id, city) => {
    expect(city.features.includes('noiseMap'), id).toBe(getNoiseWmsUrl(id, 'road') !== null);
    expect(city.features.includes('noiseTotal'), id).toBe(getNoiseWmsUrl(id, 'total') !== null);
  });

  // The noise map's credit once named Berlin's open-data portal for every city.
  it.each(ALL_CONFIGURED.filter((c) => c.features.includes('noiseMap')).map((c) => [c.id] as const))(
    'credits %s\'s noise map to the host it comes from',
    (id) => {
      const wmsHost = new URL(getNoiseWmsUrl(id, 'road')!).hostname;
      const credited = [...getNoiseWmsAttribution(id)!.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1]!).hostname);
      const sameCity = (host: string) => host.split('.').slice(-2).join('.') === wmsHost.split('.').slice(-2).join('.');
      expect(credited.some(sameCity), id).toBe(true);
    },
  );

  it('keeps the directory and rent map, which name Berlin\'s services, to Berlin', () => {
    for (const city of ALL_CONFIGURED.filter((c) => c.id !== 'berlin')) {
      expect(city.features, city.id).not.toContain('crisis');
      expect(city.features, city.id).not.toContain('rentMap');
    }
  });
});
