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

  it('takes council meetings from the Bürgerschaft calendar alone, as no Bezirksversammlung source answers', () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    expect(getCityConfig('hamburg')!.dataSources.councilMeetings).toEqual({
      hamburgBuergerschaft: {
        calendarUrl: 'https://www.hamburgische-buergerschaft.de/aktuelles/termine/1042880!search',
      },
    });
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

  it('takes events from the city’s open data and council meetings from its OParl 1.1 body', () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const { dataSources } = getCityConfig('koeln')!;
    expect(dataSources.events).toEqual([
      { source: 'stadt-koeln', url: 'https://www.stadt-koeln.de/externe-dienste/open-data/events-od.php' },
    ]);
    expect(dataSources.councilMeetings?.oparlBody?.meetingsUrl)
      .toBe('https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/meetings');
    expect(dataSources.councilMeetings?.oparlBody?.districtBody).toBe('Bezirksvertretung');
  });

  it('has its licence-checked feeds, Polizei Köln, roadworks, KVB lift outages and Datenkatalog, and no other city-specific source', () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    const config = getCityConfig('koeln')!;
    expect(config.feeds.map((f) => f.name)).toEqual(['WDR Rheinland', 'Kölner Stadt-Anzeiger', 'EXPRESS', 'Stadt Köln']);
    // Polizei Köln (presseportal newsroom 12415), not another force's newsroom
    expect(config.dataSources.police?.url).toBe('https://www.presseportal.de/rss/dienststelle_12415.rss2');
    expect(config.dataSources.roadworks?.provider).toBe('koeln-wfs');
    expect(config.dataSources.socialAtlas?.provider).toBe('koeln-datenkatalog');
    expect(config.dataSources.population?.provider).toBe('koeln-datenkatalog');
    // KVB's lift and escalator outages, its only open transit data (dl-de/zero-2.0)
    expect(config.dataSources.liftOutages).toEqual({ provider: 'kvb', url: 'https://data.webservice-kvb.koeln/service/opendata' });
    // The kreisfreie Stadt's own BA table and AMELAG plant
    expect(config.dataSources.laborMarket).toEqual({ provider: 'ba', scope: 'kreis', name: 'Köln, Stadt' });
    expect(config.dataSources.wastewater).toEqual({ provider: 'amelag', sites: ['Köln'] });
    const {
      weather: _weather, nina: _nina, aeds: _aeds, pollen: _pollen, waterLevels: _water,
      police: _police, roadworks: _roadworks, events: _events, councilMeetings: _council,
      liftOutages: _lifts, laborMarket: _labor, wastewater: _wastewater,
      socialAtlas: _socialAtlas, population: _population, ...rest
    } = config.dataSources;
    expect(rest).toEqual({});
  });

  it('lists every police district before any later name it is part of', () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln');
    // The first name found in a title wins, so a name must not contain an earlier one.
    const districts = getCityConfig('koeln')!.dataSources.police!.districts!;
    for (const [i, later] of districts.entries()) {
      for (const earlier of districts.slice(0, i)) {
        expect(later.includes(earlier), `${later} contains the earlier ${earlier}`).toBe(false);
      }
    }
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

  it('takes council meetings from the RIS RSS feeds, as the RIS has no OParl', () => {
    const { dataSources } = getCityConfig('muenchen')!;
    expect(dataSources.councilMeetings).toEqual({
      muenchenRis: {
        councilFeedUrl: 'https://risi.muenchen.de/risi/rss?feed=StR-Sitzungen',
        districtFeedUrl: 'https://risi.muenchen.de/risi/rss?feed=BA-Sitzungen',
      },
    });
  });

  it('takes social atlas and population from the Indikatorenatlas datasets, on the shipped Stadtbezirk outlines', () => {
    const { dataSources } = getCityConfig('muenchen')!;
    expect(dataSources.socialAtlas).toMatchObject({ provider: 'muenchen-indikatorenatlas', ckanApi: 'https://opendata.muenchen.de/api/3/action', year: 2024, outlines: 'muenchen-stadtbezirke.geojson' });
    expect(dataSources.population).toMatchObject({ provider: 'muenchen-indikatorenatlas', ckanApi: 'https://opendata.muenchen.de/api/3/action', outlines: 'muenchen-stadtbezirke.geojson' });
  });

  it('has its licence-checked feeds, roadworks and Isar flood gauges, and no river levels, police or other city-specific source', () => {
    const config = getCityConfig('muenchen')!;
    expect(config.feeds.map((f) => f.name)).toEqual(['BR24 Oberbayern', 'Feuerwehr München']);
    // polizei.bayern.de's robots.txt disallows all; the Polizeipräsidium is not on presseportal
    expect(config.dataSources.police).toBeUndefined();
    expect(config.dataSources.roadworks?.provider).toBe('muenchen-wfs');
    // The Isar is not on PEGELONLINE: flood class from the LHP instead, the city's gauge first
    expect(config.dataSources.floodStatus?.stations.map((s) => s.id)).toEqual(['BY_16005701', 'BY_16004403']);
    // The city's Kreis table, not the wider Agentur für Arbeit München
    expect(config.dataSources.laborMarket).toEqual({ provider: 'ba', scope: 'kreis', name: 'München, Landeshauptstadt' });
    expect(config.dataSources.wastewater).toEqual({ provider: 'amelag', sites: ['München'] });
    const {
      weather: _weather, nina: _nina, aeds: _aeds, pollen: _pollen, roadworks: _roadworks, councilMeetings: _council,
      floodStatus: _flood, laborMarket: _labor, wastewater: _wastewater, socialAtlas: _socialAtlas, population: _population, ...rest
    } = config.dataSources;
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
