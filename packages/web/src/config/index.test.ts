import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CityConfig } from '@city-monitor/shared';
import { getAllCities, getCityConfig, getDefaultCityId } from './index.js';
import { berlin } from './cities/berlin.js';
import { hamburg } from './cities/hamburg.js';
import { koeln } from './cities/koeln.js';

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

  async function load(dir: string, file: string): Promise<CityConfig> {
    const mod = (await import(/* @vite-ignore */ resolve(dir, file))) as Record<string, CityConfig>;
    return Object.values(mod)[0]!;
  }

  it('configure the same cities', () => {
    expect(cityFiles(WEB_DIR)).toEqual(cityFiles(SERVER_DIR));
  });

  // The two packages keep their own copy of each city; these fields must not drift apart.
  it('agree on the identity, place, time zone and languages of each city', async () => {
    for (const file of cityFiles(WEB_DIR)) {
      const web = await load(WEB_DIR, file);
      const server = await load(SERVER_DIR, file);
      const pick = ({ id, name, country, coordinates, boundingBox, timezone, languages }: CityConfig) =>
        ({ id, name, country, coordinates, boundingBox, timezone, languages });
      expect(pick(web), file).toEqual(pick(server));
    }
  });
});
