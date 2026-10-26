import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  AedLocationSchema, AirQualityGridSchema, BathingSpotSchema, BudgetSummarySchema, BuergeramtDataSchema,
  ConstructionSiteSchema, CouncilMeetingSchema, EmergencyPharmacySchema, FeuerwehrSummarySchema,
  LaborMarketSummarySchema, NinaWarningSchema, NoiseSensorSchema, PoliticalDistrictSchema, PollenForecastSchema,
  PopulationSummarySchema, TrafficIncidentSchema, TransitAlertSchema, WastewaterSummarySchema,
  WaterLevelDataSchema, WeatherDataSchema,
} from '@city-monitor/shared/schemas.js';
import type { AirQuality } from '@city-monitor/shared';
import { berlin } from '../config/cities/berlin.js';
import {
  generateSyntheticAirQuality, generateSyntheticData, seedFromModel, syntheticModel, type SyntheticData,
} from './generate.js';

const NOW = new Date('2026-10-26T10:30:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Berlin wall-clock time without offset, "YYYY-MM-DDTHH:MM:SS". */
function berlinIso(at: Date): string {
  return at.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T');
}

function points(d: SyntheticData): Array<{ what: string; lat: number; lon: number }> {
  const out: Array<{ what: string; lat: number; lon: number }> = [];
  const add = (what: string, p: { lat: number; lon: number } | null | undefined) => {
    if (p) out.push({ what, lat: p.lat, lon: p.lon });
  };
  // GeoJSON positions are [lon, lat], nested to any depth
  const addCoords = (what: string, coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') add(what, { lon: coords[0], lat: coords[1] as number });
    else coords.forEach((c) => addCoords(what, c));
  };
  d.news.forEach((n) => add('news', n.location));
  d.safety.forEach((s) => add('safety', s.location));
  d.transit.forEach((t) => add('transit', t.location));
  d.airQualityGrid.forEach((p) => add('aq grid', p));
  d.waterLevels.stations.forEach((s) => add('water level', s));
  d.construction.forEach((c) => addCoords('construction', c.geometry.coordinates));
  d.traffic.forEach((t) => addCoords('traffic', t.geometry.coordinates));
  d.pharmacies.forEach((p) => add('pharmacy', p.location));
  d.aeds.forEach((a) => add('aed', a));
  d.socialAtlas.features.forEach((f) => addCoords('social atlas', f.geometry.coordinates));
  d.population.geojson.features.forEach((f) => addCoords('population', f.geometry.coordinates));
  d.bathing.forEach((b) => add('bathing', b));
  d.noiseSensors.forEach((s) => add('noise', s));
  d.nina.forEach((w) => addCoords('nina', (w.area?.geometry as { coordinates?: unknown } | undefined)?.coordinates));
  return out;
}

describe('generateSyntheticData', () => {
  const data = generateSyntheticData({ now: NOW });

  it('is the same for the same seed and different for another', () => {
    const again = JSON.stringify(generateSyntheticData({ now: NOW }));
    expect(again).toBe(JSON.stringify(data));
    expect(JSON.stringify(generateSyntheticData({ now: NOW, seed: 2 }))).not.toBe(again);
  });

  it('names its seed in the briefing model, and air quality depends on the seed alone', () => {
    expect(seedFromModel(data.summary.model)).toBe(1);
    expect(seedFromModel(syntheticModel(-3))).toBe(-3);
    expect(seedFromModel('gpt-6-luna')).toBeNull();
    expect(seedFromModel(undefined)).toBeNull();

    // dev-synthetic.ts regenerates air quality at startup, hours after the seed ran
    const values = (aq: AirQuality) => ({ ...aq.current, updatedAt: '', hourly: aq.hourly.map((h) => h.europeanAqi) });
    const later = generateSyntheticAirQuality({ now: new Date(NOW.getTime() + 5 * HOUR + 17 * 60_000), seed: 1 });
    expect(values(later)).toEqual(values(data.airQuality));
    expect(values(generateSyntheticAirQuality({ now: NOW, seed: 2 }))).not.toEqual(values(data.airQuality));
  });

  it('fills every slot of the bootstrap response (routes/bootstrap.ts)', () => {
    const slots: Record<string, unknown> = {
      news: data.news.filter((n) => n.assessment?.relevant_to_city),
      weather: data.weather.hourly,
      transit: data.transit,
      events: data.events,
      safety: data.safety,
      nina: data.nina,
      airQuality: data.airQuality.hourly,
      pharmacies: data.pharmacies,
      aeds: data.aeds,
      traffic: data.traffic,
      construction: data.construction,
      waterLevels: data.waterLevels.stations,
      budget: data.budget.areas,
      appointments: data.appointments.services,
      laborMarket: [data.laborMarket],
      wastewater: data.wastewater.pathogens,
      populationSummary: [data.population.summary],
      feuerwehr: [data.feuerwehr.current],
      pollen: Object.keys(data.pollen.pollen),
      noiseSensors: data.noiseSensors,
      councilMeetings: data.councilMeetings,
    };
    for (const [slot, items] of Object.entries(slots)) {
      expect((items as unknown[]).length, slot).toBeGreaterThan(0);
    }
  });

  it('fills the map layers and the history charts', () => {
    expect(data.socialAtlas.features.length).toBeGreaterThan(100);
    expect(data.population.geojson.features).toHaveLength(data.socialAtlas.features.length);
    expect(data.airQualityGrid.length).toBeGreaterThan(10);
    expect(data.bathing.length).toBeGreaterThan(0);
    for (const level of ['bezirke', 'bundestag', 'state', 'state-bezirke'] as const) {
      expect(data.political[level].length, level).toBeGreaterThan(0);
    }
    const types = new Set(data.history.map((h) => h.type));
    // No AQI history: only the current grid is stored, like production
    expect(types).toEqual(new Set(['open-meteo', 'pegelonline', 'ba-labor-market']));
  });

  it('passes the Zod schemas the database reads validate with', () => {
    const checks: Array<[string, z.ZodType, unknown]> = [
      ['weather', WeatherDataSchema, data.weather],
      ['transit', z.array(TransitAlertSchema), data.transit],
      ['nina', z.array(NinaWarningSchema), data.nina],
      ['aq grid', AirQualityGridSchema, data.airQualityGrid],
      ['water levels', WaterLevelDataSchema, data.waterLevels],
      ['appointments', BuergeramtDataSchema, data.appointments],
      ['budget', BudgetSummarySchema, data.budget],
      ['construction', z.array(ConstructionSiteSchema), data.construction],
      ['traffic', z.array(TrafficIncidentSchema), data.traffic],
      ['pharmacies', z.array(EmergencyPharmacySchema), data.pharmacies],
      ['aeds', z.array(AedLocationSchema), data.aeds],
      ['wastewater', WastewaterSummarySchema, data.wastewater],
      ['bathing', z.array(BathingSpotSchema), data.bathing],
      ['labor market', LaborMarketSummarySchema, data.laborMarket],
      ['population', PopulationSummarySchema, data.population.summary],
      ['feuerwehr', FeuerwehrSummarySchema, data.feuerwehr],
      ['pollen', PollenForecastSchema, data.pollen],
      ['noise', z.array(NoiseSensorSchema), data.noiseSensors],
      ['council', z.array(CouncilMeetingSchema), data.councilMeetings],
      ...Object.entries(data.political).map(([level, districts]): [string, z.ZodType, unknown] =>
        [`political ${level}`, z.array(PoliticalDistrictSchema), districts]),
    ];
    for (const [name, schema, value] of checks) {
      expect(schema.safeParse(value).error, name).toBeUndefined();
    }
    for (const h of data.history.filter((s) => s.type === 'ba-labor-market')) {
      expect(LaborMarketSummarySchema.safeParse(h.data).success).toBe(true);
    }
  });

  it('places everything inside Berlin', () => {
    const { north, south, east, west } = berlin.boundingBox;
    const all = points(data);
    expect(all.length).toBeGreaterThan(500);
    for (const p of all) {
      expect(p.lat, p.what).toBeGreaterThanOrEqual(south);
      expect(p.lat, p.what).toBeLessThanOrEqual(north);
      expect(p.lon, p.what).toBeGreaterThanOrEqual(west);
      expect(p.lon, p.what).toBeLessThanOrEqual(east);
    }
  });

  it('is clearly made up', () => {
    const json = JSON.stringify(data);
    const urls = json.match(/https?:\/\/[^"\\]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(url).toMatch(/^https:\/\/example\.com\/synthetic\//);

    const people = Object.values(data.political).flat().flatMap((d) => d.representatives);
    for (const person of people) {
      expect(person.name).toMatch(/^Testperson \d{3}$/);
      expect(person.photoUrl).toBeUndefined();
    }
    const marked = [
      ...data.news.map((n) => n.title), ...data.safety.map((s) => s.title), ...data.events.map((e) => e.title),
      ...data.transit.map((t) => t.message), ...data.nina.map((w) => w.headline), ...data.weather.alerts.map((a) => a.headline),
      ...data.construction.map((c) => c.description), ...data.traffic.map((t) => t.description),
    ];
    for (const text of marked) expect(text).toMatch(/^\[Synthetisch\] /);
    for (const text of Object.values(data.summary.briefings)) expect(text.length).toBeGreaterThan(50);
    expect(Object.keys(data.summary.briefings).sort()).toEqual([...berlin.languages].sort());
  });

  it.each([
    '2026-01-15T07:00:00Z', // winter, before the pharmacies' 9:00 changeover
    '2026-03-29T00:30:00Z', // the night clocks go forward
    '2026-07-01T21:30:00Z', // summer, bathing season
    NOW.toISOString(),
  ])('dates everything relative to now (%s)', (iso) => {
    const now = new Date(iso);
    const t = now.getTime();
    const d = generateSyntheticData({ now });
    const localNow = berlinIso(now);
    const today = localNow.slice(0, 10);
    const ms = (s: string) => new Date(s).getTime();

    for (const n of d.news) expect(ms(n.publishedAt!)).toBeGreaterThan(t - DAY);
    for (const n of d.news) expect(ms(n.publishedAt!)).toBeLessThanOrEqual(t);
    for (const s of d.safety) expect(ms(s.publishedAt!)).toBeGreaterThan(t - 2 * DAY);
    for (const s of d.safety) expect(ms(s.publishedAt!)).toBeLessThanOrEqual(t);
    for (const e of d.events) {
      expect(e.date > localNow, e.date).toBe(true);
      expect(e.date < berlinIso(new Date(t + 15 * DAY)), e.date).toBe(true);
    }
    expect(d.summary.generatedAt).toEqual(now);

    expect(ms(`${d.weather.hourly[0]!.time}Z`)).toBeLessThanOrEqual(t);
    expect(ms(`${d.weather.hourly.at(-1)!.time}Z`)).toBeGreaterThan(t + 2 * DAY);
    expect(d.weather.daily[0]!.date).toBe(today);
    expect(d.weather.dwdUv!.forecastDay).toBe(today);
    expect(WeatherDataSchema.parse(d.weather).dwdUv).toEqual(d.weather.dwdUv);
    expect(d.airQuality.current.updatedAt).toBe(now.toISOString());
    for (const w of d.nina) {
      expect(ms(w.startDate)).toBeLessThanOrEqual(t);
      expect(ms(w.expiresAt!)).toBeGreaterThan(t);
    }
    for (const s of d.waterLevels.stations) expect(t - ms(s.timestamp)).toBeLessThan(HOUR);
    for (const s of d.appointments.services) if (s.earliestDate) expect(s.earliestDate > today).toBe(true);
    for (const c of d.construction) {
      expect(ms(c.validUntil!)).toBeGreaterThan(t);
      expect(ms(c.validFrom!) > t).toBe(c.isFuture);
    }
    for (const i of d.traffic) {
      expect(ms(i.startTime!)).toBeLessThan(t);
      if (i.endTime) expect(ms(i.endTime)).toBeGreaterThan(t);
    }
    for (const p of d.pharmacies) {
      expect(p.validFrom <= localNow && localNow < p.validUntil, `${p.validFrom}–${p.validUntil}`).toBe(true);
    }
    for (const m of d.councilMeetings) {
      expect(ms(m.start)).toBeGreaterThan(t);
      expect(ms(m.start)).toBeLessThan(t + 15 * DAY);
    }
    expect(d.wastewater.sampleDate < today).toBe(true);
    expect(ms(d.wastewater.sampleDate)).toBeGreaterThan(t - 14 * DAY);
    for (const b of d.bathing) expect(b.measuredAt < today).toBe(true);
    expect(d.pollen.updatedAt.startsWith(today)).toBe(true);
    expect(ms(d.population.summary.snapshotDate)).toBeLessThan(t - 90 * DAY);
    expect(ms(d.population.summary.snapshotDate)).toBeGreaterThan(t - 300 * DAY);
    expect(d.laborMarket.reportMonth < today.slice(0, 7)).toBe(true);
    expect(d.feuerwehr.current.reportMonth < today.slice(0, 7)).toBe(true);

    // History: hourly snapshots over the past week and one labour-market month each, oldest first
    const times = d.history.map((h) => h.fetchedAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
    for (const h of d.history) {
      expect(h.fetchedAt.getTime()).toBeLessThan(t);
      if (h.type !== 'ba-labor-market') expect(h.fetchedAt.getTime()).toBeGreaterThanOrEqual(t - 7 * DAY);
    }
    const months = d.history.filter((h) => h.type === 'ba-labor-market').map((h) => (h.data as { reportMonth: string }).reportMonth);
    expect(new Set([...months, d.laborMarket.reportMonth]).size).toBe(months.length + 1);
  });
});
