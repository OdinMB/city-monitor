import { describe, it, expect, afterEach } from 'vitest';
import i18n from 'i18next';
import en from '../../../i18n/en.json';
import type { PoliticalDistrict, SocialAtlasFeatureProps, PopulationFeatureProps } from '../../../lib/api.js';
import { trafficPopupHtml, constructionPopupHtml } from './traffic';
import { transitPopupHtml } from './transit';
import { warningPopupHtml } from './warnings';
import { waterLevelPopupHtml, bathingPopupHtml } from './water';
import { pharmacyPopupHtml, aedPopupHtml, formatPharmacyDuty } from './emergencies';
import { noisePopupHtml } from './noise-sensors';
import { socialAtlasPopupHtml, populationPopupHtml } from './choropleth';
import { buildPoliticalPopupHtml } from './political';
import { newsPopupHtml, safetyPopupHtml } from './news-safety';
import { aqPopupHtml } from './air-quality';

/**
 * Map popups are HTML strings built outside React, so they look their words
 * up with `i18n.t` when they open. These tests pin that every popup follows
 * the UI language and that translated text is escaped like feed data.
 */

const MALICIOUS = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

function parse(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

function textOf(html: string): string {
  return parse(html).textContent!.replace(/\s+/g, ' ');
}

function expectNoInjectedMarkup(el: HTMLElement) {
  expect(el.querySelector('img, script, iframe, object')).toBeNull();
  for (const node of el.querySelectorAll('*')) {
    for (const attr of node.attributes) {
      expect(attr.name.startsWith('on'), `${node.tagName} carries ${attr.name}`).toBe(false);
    }
  }
}

// Feature properties as MapLibre hands them to the popup builders. Data values
// are German, as the feeds send them, so any English left is UI text.
const COORDS: [number, number] = [13.4, 52.5];
const TRAFFIC = { type: 'jam', road: 'A100', description: 'Stockender Verkehr', from: 'Dreieck Funkturm', to: 'Kurfürstendamm', delay: 300 };
const CONSTRUCTION = { subtype: 'closure', street: 'Invalidenstraße', section: 'zwischen Chausseestraße und Hauptbahnhof', description: 'Vollsperrung', validFrom: '01.10.2026', validUntil: '30.11.2026', direction: 'beidseitig' };
const TRANSIT = {
  station: 'S Ostkreuz',
  alertsJson: JSON.stringify([
    { line: 'S3', type: 'planned-work', severity: 'medium', message: '', detail: 'Ersatzverkehr mit Bussen' },
    { line: 'M10', type: 'delay', severity: 'low', message: '', detail: 'Unregelmäßige Abfahrten' },
  ]),
};
const WARNING = { headline: 'Unwetterwarnung', severity: 'severe' };
const GAUGE = { name: 'Mühlendamm', waterBody: 'Spree', currentLevel: 412, state: 'very_high', tidal: true };
const BATHING = {
  name: 'Strandbad Wannsee', district: 'Steglitz-Zehlendorf', waterBody: 'Wannsee', measuredAt: '2026-08-20',
  waterTemp: 21, visibility: 1.5, quality: 'good', algae: null, advisory: null, classification: 'ausgezeichnet',
  detailUrl: 'https://www.berlin.de/lageso/gesundheit/gesundheitsschutz/badegewaesser/', inSeason: false,
};
const PHARMACY = { name: 'Apotheke am Markt', address: 'Marktstraße 1', phone: '030 123456', validFrom: '2026-03-03T09:00:00', validUntil: '2026-03-04T09:00:00' };
const AED = { indoor: true, description: 'Im Foyer', operator: 'Bezirksamt Mitte', openingHours: 'Mo-Fr 08:00-18:00', access: 'customers' };
const NOISE = { id: 4711, laeq: 58.2, laMin: 40.1, laMax: 75.3 };
const SOCIAL: SocialAtlasFeatureProps = {
  plrId: '01100101', plrName: 'Stülerstraße', bezId: '01', population: 3400, statusIndex: 2, statusLabel: 'mittel',
  unemployment: 5.2, singleParent: 20.1, welfare: 10.3, childPoverty: 15.4,
};
const POPULATION: PopulationFeatureProps = { plrId: '01100101', plrName: 'Stülerstraße', population: 3400, density: 12000, foreignPct: 30.5, elderlyPct: 15.2, youthPct: 12.1 };
const DISTRICTS: PoliticalDistrict[] = [{
  id: '1', name: 'Mitte', level: 'bezirk',
  representatives: [{ name: 'A. Person', party: 'SPD', role: 'Bezirksbürgermeisterin', profileUrl: 'https://www.berlin.de/ba-mitte/' }],
}];
const NEWS = { title: 'Tram M10 eingestellt', sourceName: 'rbb24', categoryLabel: 'Verkehr', url: 'https://www.rbb24.de/a/1', locationLabel: '', importance: 0.5 };
const SAFETY = { title: 'Einbruch in Wohnung', district: 'Mitte', url: 'https://www.berlin.de/polizei/1', locationLabel: '' };
const AQ_STATION = { aqi: 85, station: 'Berlin Mitte', url: 'https://aqicn.org/station/@6132/' };

/** Every popup builder, rendered from its fixture. */
const POPUPS: Array<[string, () => string]> = [
  ['traffic', () => trafficPopupHtml(TRAFFIC)],
  ['roadworks', () => constructionPopupHtml(CONSTRUCTION)],
  ['transit', () => transitPopupHtml(TRANSIT)],
  ['warning', () => warningPopupHtml(WARNING)],
  ['water level', () => waterLevelPopupHtml(GAUGE)],
  ['bathing', () => bathingPopupHtml(BATHING)],
  ['pharmacy', () => pharmacyPopupHtml(PHARMACY, COORDS)],
  ['AED', () => aedPopupHtml(AED, COORDS)],
  ['noise sensor', () => noisePopupHtml(NOISE, false)],
  ['social atlas', () => socialAtlasPopupHtml(SOCIAL)],
  ['population', () => populationPopupHtml(POPULATION)],
  ['political', () => buildPoliticalPopupHtml('Mitte', DISTRICTS)],
  ['political, no data', () => buildPoliticalPopupHtml('Spandau', DISTRICTS)],
  ['news', () => newsPopupHtml(NEWS)],
  ['police', () => safetyPopupHtml(SAFETY)],
  ['air quality station', () => aqPopupHtml(AQ_STATION)],
];

/**
 * English UI words the popups used to hard-code. None of them is also the
 * German, Turkish or Arabic word, so finding one there means a string was
 * missed. ("Details", "Tel" and "EU" are left out: they are the same in some
 * of those languages.)
 */
const ENGLISH_ONLY = [
  'Read more', 'Directions', 'Profile', 'No data', 'Delay', 'delay', 'Today', 'Tomorrow', 'Level', 'idal',
  'Quality', 'Water temp', 'Visibility', 'Measured', 'Off-season', 'Indoor', 'Outdoor', 'Access',
  'Noise Sensor', 'Quiet', 'Moderate', 'Loud', 'Min:', 'Max:', 'Unemployment', 'Single-parent', 'Welfare',
  'Child poverty', 'Population', 'Density', 'Foreign', 'Aged 65', 'Under 18', 'Traffic jam', 'Road closure',
  'Roadworks', 'planned work', 'Severe',
];

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe.each(['de', 'tr', 'ar'])('map popups in %s', (lang) => {
  it.each(POPUPS)('%s popup has no English UI words and no raw keys', async (_name, build) => {
    await i18n.changeLanguage(lang);
    const text = textOf(build());
    for (const word of ENGLISH_ONLY) expect(text).not.toContain(word);
    expect(text).not.toMatch(/mapPopup\.|panel\.|nina\./);
  });
});

/** ICU's German short month name ("Mär" or "März", by ICU version), not the browser's. */
const GERMAN_MARCH = new Date(2026, 2, 3).toLocaleString('de', { month: 'short' });

describe('map popups in German', () => {
  it.each([
    ['traffic', () => trafficPopupHtml(TRAFFIC), ['Stau — A100', 'Verzögerung: ~5 Min.']],
    ['roadworks', () => constructionPopupHtml(CONSTRUCTION), ['Sperrung: Invalidenstraße']],
    ['transit', () => transitPopupHtml(TRANSIT), ['S3 Bauarbeiten', 'M10 Verspätung']],
    ['warning', () => warningPopupHtml(WARNING), ['Unwetterwarnung', 'Schwer']],
    ['water level', () => waterLevelPopupHtml(GAUGE), ['Spree (Tide)', 'Pegel: 412 cm', 'Sehr hoch']],
    ['bathing', () => bathingPopupHtml(BATHING), ['Außerhalb der Saison', 'Gemessen: 2026-08-20', 'Qualität: Gut (EU: ausgezeichnet)', 'Wassertemperatur: 21°C', 'Sichttiefe: 1.5m', 'Details (LAGeSo) ↗']],
    ['pharmacy', () => pharmacyPopupHtml(PHARMACY, COORDS), ['Tel.: 030 123456', `3 ${GERMAN_MARCH} 09:00 – 4 ${GERMAN_MARCH} 09:00`, 'Route ↗']],
    ['AED', () => aedPopupHtml(AED, COORDS), ['AED / Defibrillator', 'Innen', 'Zugang: nur für Kunden', 'Route ↗']],
    ['noise sensor', () => noisePopupHtml(NOISE, false), ['Lärmsensor #4711', '58.2 dB (Laut)', 'Min.: 40.1 dB · Max.: 75.3 dB']],
    ['social atlas', () => socialAtlasPopupHtml(SOCIAL), ['Arbeitslosigkeit5.2%', 'Alleinerziehende20.1%', 'Transferbezug10.3%', 'Kinderarmut15.4%']],
    ['population', () => populationPopupHtml(POPULATION), ['Bevölkerung', 'Dichte', 'Ausländische Staatsangehörigkeit30.5%', '65 Jahre und älter15.2%', 'Unter 1812.1%']],
    ['political', () => buildPoliticalPopupHtml('Mitte', DISTRICTS), ['Profil →']],
    ['political, no data', () => buildPoliticalPopupHtml('Spandau', DISTRICTS), ['Keine Daten verfügbar']],
    ['news', () => newsPopupHtml(NEWS), ['Weiterlesen →']],
    ['police', () => safetyPopupHtml(SAFETY), ['Details →']],
    ['air quality station', () => aqPopupHtml(AQ_STATION), ['US AQI: 85 (Mäßig)']],
  ] as const)('%s popup', async (_name, build, expected) => {
    await i18n.changeLanguage('de');
    const text = textOf(build());
    for (const s of expected) expect(text).toContain(s);
  });

  it('names today and tomorrow for a pharmacy on duty overnight', async () => {
    await i18n.changeLanguage('de');
    expect(formatPharmacyDuty(localAt(0, 9), localAt(1, 9))).toBe('Heute 09:00 – Morgen 09:00');
  });
});

/** Local ISO time (no zone) `offsetDays` from today at `hour`:00, as the pharmacy feed sends it. */
function localAt(offsetDays: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00:00`;
}

describe('values after a translated label in Arabic (right-to-left)', () => {
  /** Text of every element marked left-to-right, so its digits and unit keep their order. */
  function ltrTexts(html: string): string[] {
    return [...parse(html).querySelectorAll('[dir="ltr"]')].map((n) => n.textContent!);
  }

  it.each([
    ['pharmacy phone', () => pharmacyPopupHtml({ ...PHARMACY, phone: '+49 30 2827871' }, COORDS), ['+49 30 2827871']],
    ['water level', () => waterLevelPopupHtml(GAUGE), ['412 cm']],
    ['bathing temperature and visibility', () => bathingPopupHtml(BATHING), ['21°C', '1.5m']],
    ['noise readings', () => noisePopupHtml(NOISE, false), ['58.2 dB', '40.1 dB', '75.3 dB']],
    ['social atlas values', () => socialAtlasPopupHtml(SOCIAL), ['5.2%', '20.1%', '10.3%', '15.4%']],
    ['population density', () => populationPopupHtml(POPULATION), [`${(12000).toLocaleString()}/km²`]],
  ] as const)('%s stay left-to-right', async (_name, build, values) => {
    await i18n.changeLanguage('ar');
    const texts = ltrTexts(build());
    for (const v of values) expect(texts).toContain(v);
  });
});

describe('map popups in Turkish and Arabic', () => {
  it('names the traffic incident and its delay in Turkish', async () => {
    await i18n.changeLanguage('tr');
    const text = textOf(trafficPopupHtml(TRAFFIC));
    expect(text).toContain('Trafik sıkışıklığı — A100');
    expect(text).toContain('Gecikme: ~5 dk');
  });

  it('labels the directions link and AED in Arabic', async () => {
    await i18n.changeLanguage('ar');
    const text = textOf(aedPopupHtml(AED, COORDS));
    expect(text).toContain('جهاز إزالة الرجفان (AED)');
    expect(text).toContain('الوصول: للزبائن فقط');
    expect(text).toContain('الاتجاهات ↗');
  });
});

describe('map popups in English', () => {
  it.each([
    ['traffic', () => trafficPopupHtml(TRAFFIC), ['Traffic jam — A100', 'Dreieck Funkturm → Kurfürstendamm', 'Delay: ~5 min']],
    ['roadworks', () => constructionPopupHtml(CONSTRUCTION), ['Road closure: Invalidenstraße']],
    ['transit', () => transitPopupHtml(TRANSIT), ['S3 planned work', 'M10 delay']],
    ['water level', () => waterLevelPopupHtml(GAUGE), ['Spree (Tidal)', 'Level: 412 cm', 'Very High']],
    ['bathing', () => bathingPopupHtml(BATHING), ['Off-season', 'Measured: 2026-08-20', 'Quality: Good (EU: ausgezeichnet)', 'Water temp: 21°C', 'Visibility: 1.5m', 'Details (LAGeSo) ↗']],
    ['pharmacy', () => pharmacyPopupHtml(PHARMACY, COORDS), ['Tel: 030 123456', 'Directions ↗']],
    ['AED', () => aedPopupHtml(AED, COORDS), ['AED / Defibrillator', 'Indoor', 'Access: customers only', 'Directions ↗']],
    ['noise sensor', () => noisePopupHtml(NOISE, false), ['Noise Sensor #4711', '58.2 dB (Loud)', 'Min: 40.1 dB · Max: 75.3 dB']],
    ['social atlas', () => socialAtlasPopupHtml(SOCIAL), ['Unemployment5.2%', 'Single-parent HH20.1%', 'Welfare recipients10.3%', 'Child poverty15.4%']],
    ['population', () => populationPopupHtml(POPULATION), ['Population', 'Density', 'Aged 65+15.2%', 'Under 1812.1%']],
    ['political', () => buildPoliticalPopupHtml('Mitte', DISTRICTS), ['Profile →']],
    ['political, no data', () => buildPoliticalPopupHtml('Spandau', DISTRICTS), ['No data available']],
    ['news', () => newsPopupHtml(NEWS), ['Read more →']],
    ['police', () => safetyPopupHtml(SAFETY), ['Details →']],
    ['air quality station', () => aqPopupHtml(AQ_STATION), ['US AQI: 85 (Moderate)']],
  ] as const)('%s popup', (_name, build, expected) => {
    const text = textOf(build());
    for (const s of expected) expect(text).toContain(s);
  });

  it('keeps pharmacy duty times on the 24-hour clock', () => {
    expect(formatPharmacyDuty(localAt(0, 9), localAt(1, 0))).toBe('Today 09:00 – Tomorrow 00:00');
    expect(formatPharmacyDuty(localAt(0, 21), localAt(1, 9))).toBe('Today 21:00 – Tomorrow 09:00');
  });

  it('shows an unknown incident type as the feed sent it', () => {
    expect(textOf(trafficPopupHtml({ ...TRAFFIC, type: 'lane-restriction' }))).toContain('lane-restriction — A100');
  });

  it('reads OSM access=yes as public and shows other access values as tagged', () => {
    expect(textOf(aedPopupHtml({ ...AED, access: 'yes' }, COORDS))).toContain('Access: public');
    expect(textOf(aedPopupHtml({ ...AED, access: 'delivery' }, COORDS))).toContain('Access: delivery');
  });
});

describe('translated popup text is escaped', () => {
  /** A copy of the English bundle with every string replaced by markup. */
  function hostile(value: unknown): unknown {
    if (typeof value === 'string') return MALICIOUS;
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hostile(v)]));
    }
    return value;
  }

  it.each(POPUPS)('%s popup', async (_name, build) => {
    // A structurally valid language tag, so Intl date formatting accepts it.
    i18n.addResourceBundle('zz', 'translation', hostile(en), true, true);
    await i18n.changeLanguage('zz');
    const el = parse(build());
    expectNoInjectedMarkup(el);
    expect(el.textContent).toContain(MALICIOUS);
  });
});
