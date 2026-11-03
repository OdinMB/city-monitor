import { describe, it, expect, afterEach, vi } from 'vitest';
import i18n from 'i18next';
import type * as maplibregl from 'maplibre-gl';
import type { AirQualityGridPoint, AirQualityStation } from '../../../lib/api.js';
import { createVerticalBadgeIcon } from '../../../lib/map-icons.js';
import { aqPopupHtml, ubaPopupHtml, updateAqGridLayer, updateUbaStationLayer } from './air-quality';

// jsdom has no canvas text measurement; the badge drawing itself is tested in map-icons.test.ts.
vi.mock('../../../lib/map-icons.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/map-icons.js')>()),
  createVerticalBadgeIcon: vi.fn(() => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) })),
}));

/** Markup a hostile feed or translation might carry. */
const MALICIOUS = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

function parse(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

/** A WAQI station: its value is US AQI. */
const STATION = { aqi: 85, station: 'Berlin Mitte', url: 'https://aqicn.org/station/berlin-mitte' };
/** A Sensor.Community point: its value is European AQI. */
const SENSOR = { aqi: 85, station: 'Kreuzberg', url: 'https://maps.sensor.community/#17/52.5/13.4' };

describe('aqPopupHtml', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', 'Moderate'],
    ['de', 'Mäßig'],
    ['tr', 'Orta'],
    ['ar', 'معتدل'],
  ])('labels a WAQI station US AQI with the translated US band (%s)', async (lang, label) => {
    await i18n.changeLanguage(lang);
    const text = parse(aqPopupHtml(STATION)).textContent;
    expect(text).toContain(`US AQI: 85 (${label})`);
    expect(text).not.toMatch(/panel\.|usLevel|moderate/);
  });

  /** Background colour of the band swatch before the number. */
  function swatchColour(el: HTMLElement): string {
    return el.querySelector<HTMLElement>('span[aria-hidden="true"]')!.style.backgroundColor;
  }

  it('shows the US band colour as a swatch, leaving the number in the text colour', () => {
    const el = parse(aqPopupHtml(STATION));
    expect(swatchColour(el)).toBe('rgb(255, 255, 0)');
    expect(el.querySelector('strong')!.style.color).toBe('');
  });

  it('isolates swatch and number left to right, so the swatch\'s margin falls between them in Arabic', async () => {
    await i18n.changeLanguage('ar');
    const el = parse(aqPopupHtml(STATION));
    const swatch = el.querySelector<HTMLElement>('span[aria-hidden="true"]')!;
    expect(swatch.getAttribute('style')).toContain('margin-inline-end:4px');
    const run = swatch.parentElement!;
    expect(run.tagName).toBe('BDI');
    expect(run.getAttribute('dir')).toBe('ltr');
    expect(run.querySelector('strong')!.textContent).toBe('85');
  });

  it.each([
    ['en', 'Very Poor'],
    ['de', 'Sehr schlecht'],
    ['tr', 'Çok Kötü'],
    ['ar', 'سيئ جداً'],
  ])('keeps a Sensor.Community point on the European scale (%s)', async (lang, label) => {
    await i18n.changeLanguage(lang);
    const el = parse(aqPopupHtml(SENSOR));
    expect(el.textContent).toContain(`AQI: 85 (${label})`);
    expect(el.textContent).not.toContain('US AQI');
    expect(swatchColour(el)).toBe('rgb(139, 0, 139)');
    expect(el.querySelector('strong')!.style.color).toBe('');
  });

  it('keeps a point without a link on the European scale', () => {
    const text = parse(aqPopupHtml({ ...SENSOR, url: '' })).textContent;
    expect(text).toContain('AQI: 85 (Very Poor)');
    expect(text).not.toContain('US AQI');
  });

  it('renders a malicious station name as text, not markup', () => {
    const el = parse(aqPopupHtml({ ...STATION, station: MALICIOUS }));
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.textContent).toContain(MALICIOUS);
  });

  it.each([['WAQI', STATION], ['Sensor.Community', SENSOR]])('escapes the level label like every other popup value (%s)', async (_name, props) => {
    i18n.addResourceBundle('x-hostile', 'translation', {
      panel: { airQuality: { level: { veryPoor: MALICIOUS }, usLevel: { moderate: MALICIOUS } } },
    }, true, true);
    await i18n.changeLanguage('x-hostile');
    const el = parse(aqPopupHtml(props));
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.textContent).toContain(MALICIOUS);
  });

  it('drops a javascript: link but keeps the station', () => {
    const el = parse(aqPopupHtml({ ...STATION, url: 'javascript:alert(1)' }));
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain(STATION.station);
  });
});

function fakeMap() {
  return {
    getLayer: vi.fn(() => undefined),
    removeLayer: vi.fn(),
    getSource: vi.fn(() => undefined),
    removeSource: vi.fn(),
    hasImage: vi.fn(() => false),
    removeImage: vi.fn(),
    addImage: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    on: vi.fn(),
  };
}

const WAQI_POINT: AirQualityGridPoint = { lat: 52.52, lon: 13.4, europeanAqi: 85, station: STATION.station, url: STATION.url };
const SC_POINT: AirQualityGridPoint = { lat: 52.5, lon: 13.42, europeanAqi: 85, station: SENSOR.station, url: SENSOR.url };

describe('updateAqGridLayer badges', () => {
  it('labels a WAQI badge US AQI in the US colour and leaves a Sensor.Community badge European', () => {
    const map = fakeMap();
    vi.mocked(createVerticalBadgeIcon).mockClear();
    updateAqGridLayer(map as unknown as maplibregl.Map, [WAQI_POINT, SC_POINT], false, 'berlin');

    expect(vi.mocked(createVerticalBadgeIcon).mock.calls.map(([, bg, , text, , fg]) => ({ bg, text, fg }))).toEqual([
      { bg: '#FFFF00', text: '85 US AQI', fg: '#1f2937' },
      { bg: '#8B008B', text: '85 AQI', fg: '#ffffff' },
    ]);

    // Same value on two scales: two separate badge images, each feature on its own.
    const imageIds = map.addImage.mock.calls.map(([id]) => id);
    expect(imageIds).toEqual(['aq-badge-us-85-moderate', 'aq-badge-eu-85-veryPoor']);
    const source = map.addSource.mock.calls[0][1] as { data: GeoJSON.FeatureCollection };
    expect(source.data.features.map((f) => f.properties!.iconId)).toEqual(imageIds);
  });
});

describe('updateAqGridLayer attribution', () => {
  /** The attribution markup the layer's source carries, parsed. */
  function attribution(map: ReturnType<typeof fakeMap>): HTMLElement | null {
    const spec = map.addSource.mock.calls[0]?.[1] as { attribution?: string } | undefined;
    return spec?.attribution ? parse(spec.attribution) : null;
  }

  it.each([
    ['berlin', 'European Environment Agency, BLUME'],
    ['hamburg', 'HaLm'],
  ])('credits WAQI and the originating agencies while WAQI stations are shown (%s)', (cityId, agencies) => {
    const map = fakeMap();
    updateAqGridLayer(map as unknown as maplibregl.Map, [WAQI_POINT, SC_POINT], false, cityId);

    const el = attribution(map)!;
    const link = el.querySelector('a')!;
    expect(link.textContent).toBe('World Air Quality Index Project');
    expect(link.getAttribute('href')).toBe('https://waqi.info/');
    expect(el.textContent).toBe(`© World Air Quality Index Project, ${agencies}`);
  });

  it('credits WAQI alone for a city without listed agencies', () => {
    const map = fakeMap();
    updateAqGridLayer(map as unknown as maplibregl.Map, [WAQI_POINT], false, 'elsewhere');
    expect(attribution(map)!.textContent).toBe('© World Air Quality Index Project');
  });

  it('adds no WAQI credit when the layer holds no WAQI station', () => {
    const map = fakeMap();
    updateAqGridLayer(map as unknown as maplibregl.Map, [SC_POINT], false, 'berlin');
    expect(map.addSource).toHaveBeenCalledOnce();
    expect(attribution(map)).toBeNull();
  });

  it('adds no source, and so no credit, when the layer is off', () => {
    const map = fakeMap();
    updateAqGridLayer(map as unknown as maplibregl.Map, [], false, 'berlin');
    expect(map.addSource).not.toHaveBeenCalled();
  });
});

const UBA_STATION: AirQualityStation = {
  code: 'DEBE065', name: 'Berlin Frankfurter Allee', lat: 52.5141, lon: 13.4699, setting: 'traffic', network: 'BE',
  measuredAt: '2026-11-02T23:00:00.000Z', index: 3, no2: 80, pm10: 25, pm25: 18, o3: null,
};

describe('updateUbaStationLayer', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('draws a landmark badge per class in the UBA colour, named in the UI language, with UBA’s source line', () => {
    const map = fakeMap();
    vi.mocked(createVerticalBadgeIcon).mockClear();
    updateUbaStationLayer(map as unknown as maplibregl.Map, [UBA_STATION, { ...UBA_STATION, code: 'X', index: null }], false, 'en', 'Europe/Berlin');

    expect(vi.mocked(createVerticalBadgeIcon).mock.calls.map(([, bg, , text]) => ({ bg, text }))).toEqual([
      { bg: '#FF5050', text: 'Poor' },
      { bg: '#9ca3af', text: 'No index' },
    ]);
    expect(map.addImage.mock.calls.map(([id]) => id)).toEqual(['uba-badge-poor-en', 'uba-badge-unknown-en']);
    const spec = map.addSource.mock.calls[0][1] as { attribution: string; data: GeoJSON.FeatureCollection };
    expect(parse(spec.attribution).textContent).toBe('Umweltbundesamt mit Daten der Messnetze der Länder und des Bundes (dl-de/by-2-0)');
    expect(spec.data.features[0].properties).toMatchObject({ name: 'Berlin Frankfurter Allee', index: 3, no2: 80, o3: -1 });
  });

  it('adds nothing for no stations', () => {
    const map = fakeMap();
    updateUbaStationLayer(map as unknown as maplibregl.Map, [], false, 'en', 'Europe/Berlin');
    expect(map.addSource).not.toHaveBeenCalled();
  });
});

describe('ubaPopupHtml', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  const props = {
    name: 'Berlin Frankfurter Allee', setting: 'traffic', measuredAt: '2026-11-02T23:00:00.000Z', timeZone: 'Europe/Berlin',
    index: 3, no2: 80, pm10: 25, pm25: 18, o3: -1,
  };

  it('marks the station as official, gives its class, the measured values and the hour on the city’s clock', () => {
    const el = parse(ubaPopupHtml(props));
    const text = el.textContent!.replace(/\s+/g, ' ');
    expect(text).toContain('Official measuring station · Traffic');
    expect(text).toContain('UBA air quality index: Poor');
    expect([...el.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['NO₂80 µg/m³', 'PM1025 µg/m³', 'PM2.518 µg/m³']);
    expect(text).toContain('Hour ending');
    expect(text).toContain('Umweltbundesamt mit Daten der Messnetze der Länder und des Bundes');
  });

  it('follows the UI language', async () => {
    await i18n.changeLanguage('de');
    const text = parse(ubaPopupHtml(props)).textContent!;
    expect(text).toContain('Amtliche Messstation · Verkehr');
    expect(text).toContain('Schlecht');
  });

  it('escapes a hostile station name', () => {
    const el = parse(ubaPopupHtml({ ...props, name: MALICIOUS }));
    expect(el.querySelector('img, script')).toBeNull();
  });
});
