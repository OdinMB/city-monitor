import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CityConfig, CityFeature, WebCityConfig } from '@city-monitor/shared';
import { getAllCities, getCityConfig, getDefaultCityId } from './index.js';
import { berlin } from './cities/berlin.js';
import { hamburg } from './cities/hamburg.js';
import { koeln } from './cities/koeln.js';
import { muenchen } from './cities/muenchen.js';
import {
  DISTRICT_URLS, getNoiseWmsAttribution, getNoiseWmsUrl, getRentMapAttribution, getRentMapLegend, getRentMapWmsUrl,
  getTrafficFlowAttribution, getTrafficFlowLegend, getTrafficFlowWmsUrl,
  getStreetTreesAttribution, getStreetTreesWmsUrl,
} from '../components/map/constants.js';
import { getCrisisDirectory } from '../components/strips/crisis-services.js';
import { SOCIAL_ATLAS } from '../lib/social-atlas.js';

/** Features the web app holds itself, which the server knows nothing about. */
const WEB_ONLY_FEATURES: readonly CityFeature[] = ['crisis', 'rentMap', 'noiseMap', 'noiseTotal', 'trafficFlowMap', 'politicalMap', 'bundestagByDistrict', 'streetTrees'];

const ALL_CONFIGURED = [berlin, hamburg, koeln, muenchen];

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
  it('ships with Berlin, Hamburg, Köln and München active', () => {
    expect(getAllCities().map((c) => c.id)).toEqual(['berlin', 'hamburg', 'koeln', 'muenchen']);
    expect(getCityConfig('berlin')).toBe(berlin);
    expect(getCityConfig('hamburg')).toBe(hamburg);
    expect(getCityConfig('koeln')).toBe(koeln);
    expect(getCityConfig('muenchen')).toBe(muenchen);
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

describe('München config', () => {
  it('has its German name and time zone', () => {
    expect(muenchen.id).toBe('muenchen');
    expect(muenchen.name).toBe('München');
    expect(muenchen.country).toBe('DE');
    expect(muenchen.timezone).toBe('Europe/Berlin');
    expect(muenchen.languages).toEqual(['de', 'en']);
  });
});

describe('every configured city', () => {
  const cities = ALL_CONFIGURED;

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

  // The sidebar and popup name each city's social-atlas indicators from
  // lib/social-atlas.ts: a label for an indicator the source lacks would draw
  // an empty map, and an edition other than the server's would misdate it.
  it('label exactly the social-atlas indicators, status index and edition of each city\'s source', async () => {
    const parsers = (await import(/* @vite-ignore */ resolve(here, '../../../server/src/lib/social-atlas-parsers.ts'))) as {
      SOCIAL_ATLAS_METRICS: Record<string, readonly string[]>;
      SOCIAL_ATLAS_HAS_STATUS_INDEX: Record<string, boolean>;
      socialAtlasEdition: (source: NonNullable<CityConfig['dataSources']['socialAtlas']>) => string;
    };
    for (const file of cityFiles(SERVER_DIR)) {
      const server = await load<CityConfig>(SERVER_DIR, file);
      const source = server.dataSources.socialAtlas;
      const atlas = SOCIAL_ATLAS[server.id];
      if (!source) {
        expect(atlas, file).toBeUndefined();
        continue;
      }
      expect(atlas, file).toBeDefined();
      expect(atlas!.provider, file).toBe(source.provider);
      expect(atlas!.edition, file).toBe(parsers.socialAtlasEdition(source));
      expect(atlas!.indicators.map((i) => i.metric), file).toEqual(parsers.SOCIAL_ATLAS_METRICS[source.provider]);
      expect(atlas!.status !== undefined, file).toBe(parsers.SOCIAL_ATLAS_HAS_STATUS_INDEX[source.provider]);
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

  // The rent maps are WMS layers too, each with its own classes and credit.
  it.each(ALL_CONFIGURED.map((c) => [c.id, c] as const))('%s lists a rent map exactly when it has one, with a legend', (id, city) => {
    const url = getRentMapWmsUrl(id);
    expect(city.features.includes('rentMap'), id).toBe(url !== null);
    if (url === null) return;
    expect(getRentMapLegend(id).length, id).toBeGreaterThan(0);
    const wmsHost = new URL(url).hostname;
    const credited = [...getRentMapAttribution(id)!.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1]!).hostname);
    expect(credited.some((host) => host.split('.').slice(-2).join('.') === wmsHost.split('.').slice(-2).join('.')), id).toBe(true);
  });

  // The live congestion maps are WMS layers too, with their classes and credit.
  it.each(ALL_CONFIGURED.map((c) => [c.id, c] as const))('%s lists a congestion map exactly when it has one, with a legend', (id, city) => {
    const url = getTrafficFlowWmsUrl(id);
    expect(city.features.includes('trafficFlowMap'), id).toBe(url !== null);
    if (url === null) return;
    expect(getTrafficFlowLegend(id).length, id).toBeGreaterThan(0);
    const wmsHost = new URL(url).hostname;
    const credited = [...getTrafficFlowAttribution(id)!.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1]!).hostname);
    expect(credited).toContain(wmsHost);
  });

  // The trees layer is the city's tree-register WMS (STREET_TREES_WMS), credited to its provider.
  it.each(ALL_CONFIGURED.map((c) => [c.id, c] as const))('%s lists street trees exactly when it has a tree register', (id, city) => {
    const url = getStreetTreesWmsUrl(id);
    expect(city.features.includes('streetTrees'), id).toBe(url !== null);
    if (url === null) return;
    const wmsHost = new URL(url).hostname;
    const credited = [...getStreetTreesAttribution(id)!.matchAll(/href="([^"]+)"/g)].map((m) => new URL(m[1]!).hostname);
    expect(credited, id).toContain(wmsHost);
  });

  // The crisis tile shows the city's own directory (crisis-services.ts), so a
  // city listing the feature without one would show an empty tile, and one
  // leaving it out would hide numbers it has.
  it.each(ALL_CONFIGURED.map((c) => [c.id, c] as const))('%s lists the crisis tile exactly when it has a crisis directory', (id, city) => {
    expect(city.features.includes('crisis'), id).toBe(getCrisisDirectory(id) !== null);
  });

  // The political map layer colours district outlines the web app ships
  // (DISTRICT_URLS); without them it would draw nothing. With them it still
  // needs a view whose members map onto Bezirke (map-layers.ts), so München,
  // with outlines but no such view, lists none.
  it.each(ALL_CONFIGURED.map((c) => [c.id, c] as const))('%s lists the political map only with district outlines and a view by Bezirk', (id, city) => {
    const byBezirk = (['districtMayors', 'bundestagByDistrict', 'stateByDistrict'] as const).some((f) => city.features.includes(f));
    expect(city.features.includes('politicalMap'), id).toBe(Object.hasOwn(DISTRICT_URLS, id) && city.features.includes('political') && byBezirk);
  });

  it('ships district outlines for every configured city', () => {
    expect(Object.keys(DISTRICT_URLS).sort()).toEqual(ALL_CONFIGURED.map((c) => c.id).sort());
  });

  it('has a crisis directory for no city it does not configure', () => {
    expect(getCrisisDirectory('nowhere')).toBeNull();
    expect(getCrisisDirectory('toString')).toBeNull();
  });
});
