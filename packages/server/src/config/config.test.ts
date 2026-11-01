import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getActiveCities, getCityConfig } from './index.js';

describe('City config', () => {
  beforeEach(() => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  it('returns Berlin config', () => {
    const cities = getActiveCities();
    expect(cities).toHaveLength(1);
    expect(cities[0]!.id).toBe('berlin');
    expect(cities[0]!.name).toBe('Berlin');
    expect(cities[0]!.country).toBe('DE');
  });

  it('getCityConfig returns config for known city', () => {
    const config = getCityConfig('berlin');
    expect(config).toBeDefined();
    expect(config!.timezone).toBe('Europe/Berlin');
  });

  it('getCityConfig returns undefined for unknown city', () => {
    const config = getCityConfig('unknown');
    expect(config).toBeUndefined();
  });

  it('Berlin config has feeds', () => {
    const config = getCityConfig('berlin');
    expect(config!.feeds.length).toBeGreaterThan(0);
  });

  it('Berlin config has weather data source', () => {
    const config = getCityConfig('berlin');
    expect(config!.dataSources.weather.provider).toBe('brightsky');
  });

  it('getCityConfig returns undefined for inactive city', () => {
    // Hamburg is defined but not in ACTIVE_CITIES
    const config = getCityConfig('hamburg');
    expect(config).toBeUndefined();
  });

  it('getCityConfig returns Hamburg config when active', () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    const config = getCityConfig('hamburg');
    expect(config).toBeDefined();
    expect(config!.id).toBe('hamburg');
    expect(config!.name).toBe('Hamburg');
    expect(config!.theme.accent).toBe('#004B93');
  });

  it('Hamburg config has feeds and data sources when active', () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    const config = getCityConfig('hamburg');
    expect(config!.feeds.length).toBeGreaterThan(0);
    expect(config!.dataSources.weather.provider).toBe('brightsky');
    // Hamburg transit not supported — HVV transport.rest API is offline
    expect(config!.dataSources.transit).toBeUndefined();
  });

  it('supports multiple active cities', () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    const cities = getActiveCities();
    expect(cities).toHaveLength(2);
    expect(cities.map((c) => c.id)).toEqual(['berlin', 'hamburg']);
  });

  it('serves Berlin alone when ACTIVE_CITIES is unset', () => {
    vi.stubEnv('ACTIVE_CITIES', '');
    expect(getActiveCities().map((c) => c.id)).toEqual(['berlin']);
  });
});

describe('Köln config', () => {
  beforeEach(() => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  it('is configured but inactive until ACTIVE_CITIES names it', () => {
    expect(getCityConfig('koeln')).toBeUndefined();
    expect(getActiveCities().map((c) => c.id)).toEqual(['berlin']);
  });

  it('is served when active, alone or beside Berlin', () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    expect(getActiveCities().map((c) => c.id)).toEqual(['koeln']);
    vi.stubEnv('ACTIVE_CITIES', 'berlin,koeln');
    expect(getActiveCities().map((c) => c.id)).toEqual(['berlin', 'koeln']);
  });

  it('has its German name, country and time zone', () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const config = getCityConfig('koeln')!;
    expect(config.id).toBe('koeln');
    // The DWD UV file is matched by this name
    expect(config.name).toBe('Köln');
    expect(config.country).toBe('DE');
    expect(config.timezone).toBe('Europe/Berlin');
    expect(config.languages).toEqual(['de', 'en']);
  });

  it('sits on the Rhein at Köln', () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const { coordinates, boundingBox } = getCityConfig('koeln')!;
    // Köln cathedral, 50.9413 N 6.9583 E, is within a kilometre of the centre
    expect(coordinates.lat).toBeCloseTo(50.94, 1);
    expect(coordinates.lon).toBeCloseTo(6.96, 1);
    // The city reaches from Worringen (~51.08 N) to Libur (~50.83 N)
    expect(boundingBox.north).toBeGreaterThan(51.08);
    expect(boundingBox.south).toBeLessThanOrEqual(50.83);
  });

  it('uses the Germany-wide sources that cover Köln', () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const { dataSources } = getCityConfig('koeln')!;
    expect(dataSources.weather.provider).toBe('brightsky');
    // DWD warn cell 105315000 (cap_warncellids_csv.csv)
    expect(dataSources.weather.dwdWarnRegion).toBe('Stadt Köln');
    expect(dataSources.nina).toEqual({ ars: '053150000000' });
    // The kreisfreie Stadt's OSM boundary: a city inside a state is not at the state level (4)
    expect(dataSources.aeds).toEqual({ adminLevel: 6 });
    expect(dataSources.pollen).toEqual({ provider: 'dwd', regionId: 40, partregionId: 41 });
    expect(dataSources.waterLevels).toEqual({
      provider: 'pegelonline',
      stations: [{ uuid: 'a6ee8177-107b-47dd-bcfd-30960ccc6e9c', name: 'Köln', waterBody: 'Rhein' }],
    });
  });

  it('has no city-specific source but roadworks yet, so the other jobs fetch nothing for Köln', () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const config = getCityConfig('koeln')!;
    expect(config.feeds).toEqual([]);
    expect(config.dataSources.roadworks?.provider).toBe('koeln-wfs');
    const { weather: _weather, nina: _nina, aeds: _aeds, pollen: _pollen, waterLevels: _water, roadworks: _roadworks, ...rest } = config.dataSources;
    expect(rest).toEqual({});
  });
});

describe('München config', () => {
  beforeEach(() => {
    vi.stubEnv('ACTIVE_CITIES', 'muenchen');
  });

  it('is configured but inactive until ACTIVE_CITIES names it', () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    expect(getCityConfig('muenchen')).toBeUndefined();
  });

  it('has its German name, country and time zone', () => {
    const config = getCityConfig('muenchen')!;
    expect(config.id).toBe('muenchen');
    // The DWD UV file is matched by this name
    expect(config.name).toBe('München');
    expect(config.country).toBe('DE');
    expect(config.timezone).toBe('Europe/Berlin');
    expect(config.languages).toEqual(['de', 'en']);
  });

  it('sits on the Isar at München', () => {
    const { coordinates, boundingBox } = getCityConfig('muenchen')!;
    // Marienplatz, 48.1372 N 11.5755 E, is the centre
    expect(coordinates.lat).toBeCloseTo(48.137, 2);
    expect(coordinates.lon).toBeCloseTo(11.576, 2);
    // The city reaches from Feldmoching (~48.24 N) to Solln (~48.07 N), Pasing (~11.37 E) to Trudering (~11.71 E)
    expect(boundingBox.north).toBeGreaterThan(48.24);
    expect(boundingBox.south).toBeLessThan(48.07);
    expect(boundingBox.west).toBeLessThan(11.37);
    expect(boundingBox.east).toBeGreaterThan(11.71);
  });

  it('uses the Germany-wide sources that cover München', () => {
    const { dataSources } = getCityConfig('muenchen')!;
    expect(dataSources.weather.provider).toBe('brightsky');
    // DWD's one region for city and Landkreis (dwd:Warngebiete_Kreise, 2026-11-01)
    expect(dataSources.weather.dwdWarnRegion).toBe('Kreis und Stadt München');
    // kreisfreie Stadt München, AGS 09162000
    expect(dataSources.nina).toEqual({ ars: '091620000000' });
    // The kreisfreie Stadt's OSM boundary, not the state's (4)
    expect(dataSources.aeds).toEqual({ adminLevel: 6 });
    // DWD pollen region Bayern, part-region Allgäu/Oberbayern/Bay. Wald
    expect(dataSources.pollen).toEqual({ provider: 'dwd', regionId: 120, partregionId: 121 });
  });

  it('has no river gauge and no city-specific source but roadworks yet, so the other jobs fetch nothing for München', () => {
    const config = getCityConfig('muenchen')!;
    expect(config.feeds).toEqual([]);
    expect(config.dataSources.roadworks?.provider).toBe('muenchen-wfs');
    const { weather: _weather, nina: _nina, aeds: _aeds, pollen: _pollen, roadworks: _roadworks, ...rest } = config.dataSources;
    expect(rest).toEqual({});
  });
});

describe('every configured city', () => {
  beforeEach(() => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg,koeln,muenchen');
  });

  it('is found by its id', () => {
    for (const id of ['berlin', 'hamburg', 'koeln', 'muenchen']) {
      expect(getCityConfig(id)?.id).toBe(id);
    }
  });

  it('has its centre inside its bounding box and its weather at its centre', () => {
    for (const city of getActiveCities()) {
      const { coordinates: { lat, lon }, boundingBox: box } = city;
      expect(box.south < lat && lat < box.north, city.id).toBe(true);
      expect(box.west < lon && lon < box.east, city.id).toBe(true);
      expect(city.dataSources.weather, city.id).toMatchObject({ lat, lon });
      expect(city.map.center, city.id).toEqual([lon, lat]);
    }
  });

  it('has map bounds that contain its bounding box', () => {
    for (const city of getActiveCities()) {
      const [[west, south], [east, north]] = city.map.bounds!;
      const box = city.boundingBox;
      expect(west <= box.west && south <= box.south, city.id).toBe(true);
      expect(east >= box.east && north >= box.north, city.id).toBe(true);
    }
  });

  it('has a 12-digit NINA region key when it has one', () => {
    for (const city of getActiveCities()) {
      if (city.dataSources.nina) expect(city.dataSources.nina.ars, city.id).toMatch(/^\d{12}$/);
    }
  });
});
