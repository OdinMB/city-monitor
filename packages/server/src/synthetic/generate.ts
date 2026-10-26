/**
 * Synthetic data for the dev database: one plausible, obviously made-up data
 * set (Berlin) for every dashboard tile and map layer. Timestamps are relative
 * to `now`, so freshness checks see the data as current, and the output is the
 * same for the same seed and `now`.
 *
 * Shapes come from the shared types and, where the ingestion code has them,
 * its helpers, so a schema change surfaces here as a type error or a test
 * failure. Text is German like the real sources and marked "[Synthetisch]";
 * links go to example.com; people are "Testperson NNN".
 */

import SunCalc from 'suncalc';
import type {
  AedLocation, AirQuality, AirQualityGridPoint, BathingSpot, BudgetSummary, BuergeramtData,
  CityEvent, ConstructionSite, CouncilMeeting, CurrentWeather, DailyForecast, EmergencyPharmacy,
  FeuerwehrMonthData, FeuerwehrSummary, HourlyForecast, LaborMarketSummary, NinaWarning,
  NoiseSensor, PoliticalDistrict, PollenForecast, PollenIntensity, PollenType, PollenTypeForecast,
  PopulationFeatureProps, PopulationSummary, Representative, SafetyReport, SocialAtlasFeatureProps,
  TrafficIncident, TransitAlert, WastewaterSummary, WaterLevelData, WaterLevelStation, WeatherData,
} from '@city-monitor/shared';
import { berlin } from '../config/cities/berlin.js';
import type { SnapshotType } from '../db/schema.js';
import type { PersistedNewsItem } from '../db/writes.js';
import { aggregateBudgetData, type ParsedBudgetRow } from '../cron/ingest-budget.js';
import { deriveStatus } from '../cron/ingest-appointments.js';
import { berlinUtcOffset } from '../cron/ingest-council-meetings.js';
import { computeLevel, computeTrend } from '../cron/ingest-wastewater.js';
import { hashString } from '../lib/hash.js';

export interface SyntheticSnapshot {
  type: SnapshotType;
  fetchedAt: Date;
  data: unknown;
}

export interface PolygonFeatureCollection<P> {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; geometry: { type: 'Polygon'; coordinates: number[][][] }; properties: P }>;
}

export type PoliticalLevel = 'bezirke' | 'bundestag' | 'state' | 'state-bezirke';

export interface SyntheticData {
  cityId: string;
  news: PersistedNewsItem[];
  summary: { briefings: Record<string, string>; headlineHash: string; headlineCount: number; model: string; generatedAt: Date };
  events: CityEvent[];
  safety: SafetyReport[];
  weather: WeatherData;
  /** Production keeps this in the cache only (no table), so the synthetic server caches it directly. */
  airQuality: AirQuality;
  airQualityGrid: AirQualityGridPoint[];
  transit: TransitAlert[];
  nina: NinaWarning[];
  waterLevels: WaterLevelData;
  appointments: BuergeramtData;
  budget: BudgetSummary;
  construction: ConstructionSite[];
  traffic: TrafficIncident[];
  pharmacies: EmergencyPharmacy[];
  aeds: AedLocation[];
  socialAtlas: PolygonFeatureCollection<SocialAtlasFeatureProps>;
  population: { geojson: PolygonFeatureCollection<PopulationFeatureProps>; summary: PopulationSummary };
  wastewater: WastewaterSummary;
  bathing: BathingSpot[];
  laborMarket: LaborMarketSummary;
  feuerwehr: FeuerwehrSummary;
  pollen: PollenForecast;
  noiseSensors: NoiseSensor[];
  councilMeetings: CouncilMeeting[];
  political: Record<PoliticalLevel, PoliticalDistrict[]>;
  /** Older snapshots behind the history endpoints (weather, water levels, labor market), oldest first. */
  history: SyntheticSnapshot[];
}

/**
 * Stored as the briefing's model, so the API's `generator` field shows where
 * it came from and dev-synthetic.ts can tell which seed the database holds.
 */
export function syntheticModel(seed: number): string {
  return `synthetic-seed-${seed}`;
}

export function seedFromModel(model: string | undefined): number | null {
  const match = /^synthetic-seed-(-?\d+)$/.exec(model ?? '');
  return match ? Number(match[1]) : null;
}

/**
 * Current air quality, which production keeps in the cache only, so
 * dev-synthetic.ts caches it at startup. It draws from its own stream, so its
 * values depend on the seed alone and match the seeded data set.
 */
export function generateSyntheticAirQuality(options: { now: Date; seed?: number }): AirQuality {
  return generateAirQuality(createRng((options.seed ?? 1) ^ 0x5eed), options.now);
}

const MARK = '[Synthetisch]';
const EXAMPLE = 'https://example.com/synthetic';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export function generateSyntheticData(options: { now: Date; seed?: number }): SyntheticData {
  const { now, seed = 1 } = options;
  const rng = createRng(seed);
  const weatherModel = createWeatherModel(rng);
  const areas = generateAreas(rng, now);
  const news = generateNews(rng, now);

  const aqStations = airQualityStations(rng);
  const gauges = waterGauges(rng);

  const history: SyntheticSnapshot[] = [];
  for (let h = 167; h >= 1; h--) {
    const at = new Date(now.getTime() - h * HOUR);
    history.push(
      { type: 'open-meteo', fetchedAt: at, data: { current: currentWeather(rng, weatherModel, at), hourly: [], daily: [], alerts: [] } },
      { type: 'pegelonline', fetchedAt: at, data: { stations: waterStationsAt(rng, gauges, at) } },
    );
  }
  const thisMonth = local(now).date.slice(0, 7);
  for (let k = 23; k >= 1; k--) {
    const fetchedAt = new Date(`${shiftMonth(thisMonth, -k)}-05T08:00:00Z`);
    history.push({ type: 'ba-labor-market', fetchedAt, data: laborMarketFor(rng, shiftMonth(thisMonth, -k - 1), k) });
  }
  history.sort((a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime());

  return {
    cityId: berlin.id,
    news,
    summary: generateSummary(news, now, seed),
    events: generateEvents(rng, now),
    safety: generateSafety(rng, now),
    weather: generateWeather(rng, weatherModel, now),
    airQuality: generateSyntheticAirQuality({ now, seed }),
    airQualityGrid: airQualityGridAt(rng, aqStations, now),
    transit: generateTransit(rng),
    nina: generateNina(now),
    waterLevels: { stations: waterStationsAt(rng, gauges, now), fetchedAt: now.toISOString() },
    appointments: generateAppointments(rng, now),
    budget: generateBudget(rng, now),
    construction: generateConstruction(rng, now),
    traffic: generateTraffic(rng, now),
    pharmacies: generatePharmacies(rng, now),
    aeds: generateAeds(rng),
    socialAtlas: areas.socialAtlas,
    population: areas.population,
    wastewater: generateWastewater(rng, now),
    bathing: generateBathing(rng, now),
    laborMarket: laborMarketFor(rng, shiftMonth(thisMonth, -1), 0),
    feuerwehr: generateFeuerwehr(rng, now),
    pollen: generatePollen(rng, now),
    noiseSensors: generateNoiseSensors(rng),
    councilMeetings: generateCouncilMeetings(rng, now),
    political: generatePolitical(rng),
    history,
  };
}

// ---------------------------------------------------------------------------
// Randomness, time and place helpers
// ---------------------------------------------------------------------------

interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  float(min: number, max: number): number;
  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  chance(p: number): boolean;
}

/** mulberry32: small, fast, and the same sequence on every platform. */
function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    float: (min, max) => min + next() * (max - min),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick<T>(items: readonly T[]): T {
      return items[Math.floor(next() * items.length)]!;
    },
    chance: (p) => next() < p,
  };
}

function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

const localFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: berlin.timezone,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Berlin wall-clock date ("YYYY-MM-DD") and time of an instant. */
function local(at: Date): { date: string; hour: number; minute: number } {
  const p = Object.fromEntries(localFormat.formatToParts(at).map((part) => [part.type, part.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

/** Offset-less Berlin wall-clock time, "YYYY-MM-DDTHH:MM" (the shape Open-Meteo and aponet use). */
function localIso(at: Date): string {
  const l = local(at);
  return `${l.date}T${pad(l.hour)}:${pad(l.minute)}`;
}

function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

function shiftMonth(ym: string, months: number): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1 + months, 1)).toISOString().slice(0, 7);
}

function floorHour(at: Date): Date {
  return new Date(Math.floor(at.getTime() / HOUR) * HOUR);
}

interface Point { lat: number; lon: number }

/** Berlin's twelve Bezirke in official order (index + 1 is the bezId), with rough centre points. */
const DISTRICTS: ReadonlyArray<Point & { name: string; plz: string }> = [
  { name: 'Mitte', lat: 52.530, lon: 13.370, plz: '10115' },
  { name: 'Friedrichshain-Kreuzberg', lat: 52.505, lon: 13.430, plz: '10997' },
  { name: 'Pankow', lat: 52.590, lon: 13.430, plz: '13187' },
  { name: 'Charlottenburg-Wilmersdorf', lat: 52.505, lon: 13.280, plz: '10627' },
  { name: 'Spandau', lat: 52.540, lon: 13.200, plz: '13597' },
  { name: 'Steglitz-Zehlendorf', lat: 52.435, lon: 13.240, plz: '12163' },
  { name: 'Tempelhof-Schöneberg', lat: 52.455, lon: 13.380, plz: '12099' },
  { name: 'Neukölln', lat: 52.445, lon: 13.450, plz: '12043' },
  { name: 'Treptow-Köpenick', lat: 52.420, lon: 13.590, plz: '12555' },
  { name: 'Marzahn-Hellersdorf', lat: 52.535, lon: 13.590, plz: '12679' },
  { name: 'Lichtenberg', lat: 52.530, lon: 13.500, plz: '10365' },
  { name: 'Reinickendorf', lat: 52.600, lon: 13.300, plz: '13403' },
];

/** Placeholder street names, so no address is a real one. */
const STREETS = ['Beispielstraße', 'Musterweg', 'Testallee', 'Probestraße', 'Platzhalterring', 'Demoweg', 'Fiktivdamm', 'Entwurfstraße'] as const;

/** A point near `p`; a degree of longitude is ~0.6 of a degree of latitude here, so it spreads wider east–west. */
function near(rng: Rng, p: Point, spread = 0.012): Point {
  return {
    lat: round(p.lat + rng.float(-spread, spread), 5),
    lon: round(p.lon + rng.float(-spread, spread) * 1.6, 5),
  };
}

/** A short line of `n` points heading away from `start`, as [lon, lat] pairs. */
function polyline(rng: Rng, start: Point, n: number): number[][] {
  const heading = rng.float(0, 2 * Math.PI);
  const coords = [[start.lon, start.lat]];
  for (let i = 1; i < n; i++) {
    const [lon, lat] = coords[i - 1]!;
    const angle = heading + rng.float(-0.4, 0.4);
    coords.push([round(lon! + 0.004 * Math.cos(angle), 5), round(lat! + 0.0025 * Math.sin(angle), 5)]);
  }
  return coords;
}

function nearestDistrict(p: Point): number {
  let best = 0;
  let bestDist = Infinity;
  DISTRICTS.forEach((d, i) => {
    const dist = squaredKm(p, d);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

function squaredKm(a: Point, b: Point): number {
  const dy = (a.lat - b.lat) * 111.32;
  const dx = (a.lon - b.lon) * 111.32 * Math.cos((52.5 * Math.PI) / 180);
  return dx * dx + dy * dy;
}

// ---------------------------------------------------------------------------
// News, briefing, events, police reports
// ---------------------------------------------------------------------------

const NEWS_SOURCES = [
  { name: 'Synthetischer Kurier', slug: 'kurier', tier: 1 },
  { name: 'Testblatt Berlin', slug: 'testblatt', tier: 2 },
  { name: 'Beispiel-Rundschau', slug: 'rundschau', tier: 2 },
  { name: 'Demo-Depesche', slug: 'depesche', tier: 3 },
] as const;

/** Headline templates per category; {d} becomes a district. */
const NEWS_TEMPLATES: Record<string, readonly string[]> = {
  transit: ['Ersatzverkehr auf einer Tramlinie in {d}', 'Neue Fahrradstraße in {d} freigegeben', 'Ampelausfall bremst Busse in {d}'],
  politics: ['Bezirksverordnete in {d} beraten über den Haushalt', 'Senat stellt Testprogramm für Schulsanierungen vor'],
  culture: ['Fiktives Museum in {d} eröffnet eine Ausstellung', 'Straßenfest in {d} am Wochenende'],
  crime: ['Polizei sucht Zeugen nach Einbruch in {d}', 'Mehrere Fahrräder in {d} gestohlen'],
  economy: ['Testfirma eröffnet einen Standort in {d}', 'Wochenmarkt in {d} wird erweitert'],
  sports: ['Sportverein aus {d} gewinnt das Derby', 'Volkslauf führt durch {d}'],
  local: ['Neuer Spielplatz in {d} eröffnet', 'Baumpflanzaktion in {d}'],
  weather: ['Wetterdienst erwartet einen windigen Tag'],
};

function generateNews(rng: Rng, now: Date): PersistedNewsItem[] {
  const categories = Object.keys(NEWS_TEMPLATES);
  return Array.from({ length: 30 }, (_, i): PersistedNewsItem => {
    const category = categories[i % categories.length]!;
    const district = rng.pick(DISTRICTS);
    const source = rng.pick(NEWS_SOURCES);
    const title = `${MARK} ${rng.pick(NEWS_TEMPLATES[category]!).replace('{d}', district.name)}`;
    const url = `${EXAMPLE}/news/${i + 1}`;
    return {
      id: hashString(url + title),
      title,
      url,
      publishedAt: new Date(now.getTime() - (i * 25 + rng.int(0, 20)) * 60_000).toISOString(),
      sourceName: source.name,
      sourceUrl: `${EXAMPLE}/feeds/${source.slug}.xml`,
      description: 'Synthetische Meldung für die lokale Entwicklung. Sie beschreibt kein echtes Ereignis.',
      category,
      tier: source.tier,
      lang: 'de',
      location: category !== 'weather' && rng.chance(0.6) ? { ...near(rng, district), label: district.name } : undefined,
      // Every tenth item is judged irrelevant, so the drop logic has something to drop
      assessment: { relevant_to_city: i % 10 !== 9, importance: round(rng.float(0.3, 0.95), 2), category },
    };
  });
}

const BRIEFINGS: Record<string, string> = {
  de: 'Dies ist ein synthetisches Briefing für die lokale Entwicklung. Kein Sprachmodell hat es geschrieben, und es beschreibt keine echten Ereignisse.\n\nAlles auf diesem Dashboard ist erfunden: Verkehr, Polizei, Kultur und Wetter zeigen nur, wie die Kacheln mit Daten aussehen.',
  en: 'This is a synthetic briefing for local development. No language model wrote it, and it describes no real events.\n\nEverything on this dashboard is made up: transit, police, culture and weather only show what the tiles look like with data in them.',
  tr: 'Bu, yerel geliştirme için hazırlanmış sentetik bir özettir. Bir dil modeli tarafından yazılmadı ve gerçek olayları anlatmıyor.\n\nBu panodaki her şey uydurmadır: ulaşım, polis, kültür ve hava durumu yalnızca kutucukların verilerle nasıl göründüğünü gösterir.',
  ar: 'هذا ملخص اصطناعي للتطوير المحلي. لم يكتبه نموذج لغوي، ولا يصف أحداثًا حقيقية.\n\nكل ما في هذه اللوحة مختلق: النقل والشرطة والثقافة والطقس تُظهر فقط شكل البطاقات عندما تحتوي على بيانات.',
};

function generateSummary(news: PersistedNewsItem[], now: Date, seed: number): SyntheticData['summary'] {
  const briefingItems = news.filter((n) => n.assessment?.relevant_to_city && (n.assessment.importance ?? 0) >= 0.5);
  return {
    briefings: Object.fromEntries(berlin.languages.map((lang) => [lang, BRIEFINGS[lang] ?? BRIEFINGS.en!])),
    headlineHash: hashString(briefingItems.slice(0, 10).map((n) => n.title).sort().join('|')),
    headlineCount: briefingItems.length,
    model: syntheticModel(seed),
    generatedAt: now,
  };
}

const EVENT_KINDS: ReadonlyArray<{ category: CityEvent['category']; title: string; source: CityEvent['source'] }> = [
  { category: 'music', title: 'Konzert: Die Platzhalter', source: 'ticketmaster' },
  { category: 'music', title: 'Jazzabend mit dem Testquartett', source: 'kulturdaten' },
  { category: 'art', title: 'Ausstellung: Beispielbilder', source: 'kulturdaten' },
  { category: 'theater', title: 'Theater: Das fiktive Stück', source: 'kulturdaten' },
  { category: 'food', title: 'Streetfood-Testmarkt', source: 'kulturdaten' },
  { category: 'market', title: 'Flohmarkt am Musterweg', source: 'kulturdaten' },
  { category: 'sport', title: 'Testlauf über 10 km', source: 'ticketmaster' },
  { category: 'community', title: 'Nachbarschaftstreffen', source: 'kulturdaten' },
  { category: 'museum', title: 'Führung: Museum der Beispiele', source: 'gomus' },
  { category: 'other', title: 'Lesung aus einem Probetext', source: 'kulturdaten' },
];

const VENUES = ['Testhalle', 'Beispielbühne', 'Demo-Saal', 'Platzhalter-Galerie'] as const;

function generateEvents(rng: Rng, now: Date): CityEvent[] {
  const { date: today, hour: nowHour } = local(now);
  const events = Array.from({ length: 30 }, (_, i): CityEvent => {
    const kind = EVENT_KINDS[i % EVENT_KINDS.length]!;
    const hour = rng.int(10, 21);
    // Over the next two weeks, always ahead of now
    const day = rng.int(0, 13) || (hour > nowHour ? 0 : 1);
    const district = rng.pick(DISTRICTS);
    return {
      id: `synthetic-event-${i + 1}`,
      title: `${MARK} ${kind.title}`,
      venue: `${rng.pick(VENUES)} ${district.name}`,
      // Offset-less local time, like the kulturdaten adapter
      date: `${shiftDate(today, day)}T${pad(hour)}:00:00`,
      category: kind.category,
      url: `${EXAMPLE}/events/${i + 1}`,
      description: 'Synthetische Veranstaltung für die lokale Entwicklung.',
      free: (kind.source === 'kulturdaten' && rng.chance(0.4)) || undefined,
      source: kind.source,
      price: kind.source === 'ticketmaster' ? `${rng.int(10, 25)}–${rng.int(30, 60)} €` : undefined,
    };
  });
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

const SAFETY_KINDS = [
  'Fahrraddiebstahl', 'Sachbeschädigung an einem Testobjekt', 'Verkehrsunfall mit Blechschaden',
  'Einbruch in eine Gartenlaube', 'Taschendiebstahl', 'Brand eines Müllcontainers',
  'Zeugenaufruf nach einem Unfall', 'Ruhestörung',
] as const;

function generateSafety(rng: Rng, now: Date): SafetyReport[] {
  return Array.from({ length: 15 }, (_, i): SafetyReport => {
    const district = rng.pick(DISTRICTS);
    // The first part of a Bezirk name is one of the police feed's district names
    const area = district.name.split('-')[0]!;
    const title = `${MARK} ${rng.pick(SAFETY_KINDS)} in ${area}`;
    const url = `${EXAMPLE}/police/${i + 1}`;
    return {
      id: hashString(url + title),
      title,
      description: 'Erfundene Polizeimeldung für die lokale Entwicklung. Der Vorfall hat nicht stattgefunden.',
      publishedAt: new Date(now.getTime() - (i * 2 + rng.float(0, 2)) * HOUR).toISOString(),
      url,
      district: area,
      location: rng.chance(0.75) ? { ...near(rng, district), label: area } : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Weather and air quality
// ---------------------------------------------------------------------------

const WEATHER_CODES = [0, 1, 2, 3, 3, 45, 61, 80] as const;
const RAIN_CODES = new Set<number>([61, 80]);

interface WeatherModel {
  temp(at: Date): number;
  code(at: Date): number;
}

/** Seasonal and daily temperature curves with one random swing and sky per local day. */
function createWeatherModel(rng: Rng): WeatherModel {
  const days = new Map<string, { shift: number; code: number }>();
  const day = (date: string) => {
    let d = days.get(date);
    if (!d) {
      d = { shift: rng.float(-3, 3), code: rng.pick(WEATHER_CODES) };
      days.set(date, d);
    }
    return d;
  };
  return {
    temp(at) {
      const l = local(at);
      const dayOfYear = (at.getTime() - Date.UTC(at.getUTCFullYear(), 0, 1)) / DAY;
      // About 0.5 °C in mid-January and 19.5 °C in mid-July, warmest at 15:00
      const seasonal = 10 - 9.5 * Math.cos((2 * Math.PI * (dayOfYear - 20)) / 365);
      return round(seasonal + day(l.date).shift + 4 * Math.sin((2 * Math.PI * (l.hour - 9)) / 24), 1);
    },
    code: (at) => day(local(at).date).code,
  };
}

function currentWeather(rng: Rng, model: WeatherModel, at: Date): CurrentWeather {
  const temp = model.temp(at);
  const code = model.code(at);
  const windSpeed = round(rng.float(5, 25), 1);
  return {
    temp,
    feelsLike: round(temp - windSpeed / 10, 1),
    humidity: rng.int(55, 90),
    precipitation: RAIN_CODES.has(code) ? round(rng.float(0.2, 2), 1) : 0,
    weatherCode: code,
    windSpeed,
    windDirection: rng.int(0, 359),
  };
}

function generateWeather(rng: Rng, model: WeatherModel, now: Date): WeatherData {
  const start = floorHour(now).getTime() - 2 * HOUR;
  const hourly = Array.from({ length: 72 }, (_, i): HourlyForecast => {
    const at = new Date(start + i * HOUR);
    const code = model.code(at);
    return {
      // UTC without offset, as the BrightSky adapter emits it
      time: at.toISOString().slice(0, 16),
      temp: model.temp(at),
      precipProb: RAIN_CODES.has(code) ? rng.int(50, 90) : rng.int(0, 20),
      weatherCode: code,
    };
  });
  const today = local(now).date;
  const daily = Array.from({ length: 7 }, (_, i): DailyForecast => {
    const date = shiftDate(today, i);
    const sun = SunCalc.getTimes(new Date(`${date}T12:00:00Z`), berlin.coordinates.lat, berlin.coordinates.lon);
    const code = model.code(new Date(`${date}T12:00:00Z`));
    return {
      date,
      high: model.temp(new Date(`${date}T13:00:00Z`)),
      low: model.temp(new Date(`${date}T03:00:00Z`)),
      weatherCode: code,
      precip: RAIN_CODES.has(code) ? round(rng.float(1, 8), 1) : 0,
      sunrise: sun.sunrise.toISOString(),
      sunset: sun.sunset.toISOString(),
    };
  });
  return {
    current: currentWeather(rng, model, now),
    hourly,
    daily,
    alerts: [{
      headline: `${MARK} Testwarnung vor Windböen`,
      severity: 'moderate',
      description: 'Synthetische Wetterwarnung für die lokale Entwicklung. Es besteht keine Gefahr.',
      validUntil: new Date(now.getTime() + 6 * HOUR).toISOString(),
    }],
    dwdUv: {
      today: syntheticUv(model, today),
      tomorrow: syntheticUv(model, shiftDate(today, 1)),
      dayAfter: syntheticUv(model, shiftDate(today, 2)),
      forecastDay: today,
    },
  };
}

/** Whole-number daily UV maximum: about 1 in midwinter and 8 in midsummer, lower under cloud or rain. */
function syntheticUv(model: WeatherModel, date: string): number {
  const noon = new Date(`${date}T12:00:00Z`);
  const dayOfYear = (noon.getTime() - Date.UTC(noon.getUTCFullYear(), 0, 1)) / DAY;
  const clearSky = 4.5 - 3.5 * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365);
  const code = model.code(noon);
  const cloud = RAIN_CODES.has(code) ? 0.5 : code >= 3 ? 0.7 : 1;
  return Math.max(0, Math.round(clearSky * cloud));
}

function generateAirQuality(rng: Rng, now: Date): AirQuality {
  const aqi = rng.int(20, 55);
  const start = floorHour(now).getTime();
  return {
    current: {
      europeanAqi: aqi,
      pm25: round(aqi * 0.35, 1),
      pm10: round(aqi * 0.6, 1),
      no2: round(rng.float(10, 40), 1),
      o3: round(rng.float(20, 80), 1),
      updatedAt: now.toISOString(),
    },
    hourly: Array.from({ length: 48 }, (_, i) => {
      const value = Math.max(5, aqi + Math.round(10 * Math.sin(i / 4)) + rng.int(-4, 4));
      // Local time without offset, as Open-Meteo returns it for timezone=Europe/Berlin
      return { time: localIso(new Date(start + i * HOUR)), europeanAqi: value, pm25: round(value * 0.35, 1), pm10: round(value * 0.6, 1) };
    }),
  };
}

type AqStation = Point & { station: string; base: number };

/** One station per Bezirk plus a second in the two most central ones; inner ones read a little worse. */
function airQualityStations(rng: Rng): AqStation[] {
  return [...DISTRICTS, DISTRICTS[0]!, DISTRICTS[1]!].map((d, i) => ({
    ...near(rng, d, 0.02),
    station: `Synthetische Messstelle ${d.name}${i >= DISTRICTS.length ? ' 2' : ''}`,
    base: (i < 2 || i >= DISTRICTS.length ? 38 : 28) + rng.float(-5, 5),
  }));
}

function airQualityGridAt(rng: Rng, stations: AqStation[], at: Date): AirQualityGridPoint[] {
  // Worse at the rush hours, better at night
  const daily = 8 * Math.sin((2 * Math.PI * (local(at).hour - 6)) / 12);
  return stations.map((s) => ({
    lat: s.lat,
    lon: s.lon,
    europeanAqi: Math.max(5, Math.round(s.base + daily + rng.float(-4, 4))),
    station: s.station,
  }));
}

// ---------------------------------------------------------------------------
// Transit, warnings, water levels, appointments, budget
// ---------------------------------------------------------------------------

/** Rough positions of the stations in the Berlin transit config. */
const STATION_COORDS: Record<string, Point> = {
  Alexanderplatz: { lat: 52.5219, lon: 13.4132 },
  Hauptbahnhof: { lat: 52.5251, lon: 13.3694 },
  'Zoologischer Garten': { lat: 52.5069, lon: 13.3324 },
  'Friedrichstraße': { lat: 52.5203, lon: 13.3870 },
  Gesundbrunnen: { lat: 52.5486, lon: 13.3884 },
  Ostkreuz: { lat: 52.5031, lon: 13.4693 },
  'Südkreuz': { lat: 52.4753, lon: 13.3655 },
  Westkreuz: { lat: 52.5010, lon: 13.2834 },
  Nollendorfplatz: { lat: 52.4993, lon: 13.3537 },
  Mehringdamm: { lat: 52.4936, lon: 13.3880 },
  Hermannplatz: { lat: 52.4867, lon: 13.4246 },
  Spandau: { lat: 52.5347, lon: 13.1972 },
};

const TRANSIT_SCENARIOS: ReadonlyArray<Pick<TransitAlert, 'lines' | 'type' | 'severity' | 'message'>> = [
  { lines: ['U8'], type: 'disruption', severity: 'high', message: 'Störung: Zugverkehr unterbrochen' },
  { lines: ['S41', 'S42'], type: 'delay', severity: 'medium', message: 'Verspätungen wegen einer Weichenstörung' },
  { lines: ['M10'], type: 'planned-work', severity: 'low', message: 'Bauarbeiten: Ersatzverkehr mit Bussen' },
  { lines: ['U2'], type: 'cancellation', severity: 'high', message: 'Einzelne Fahrten fallen aus' },
  { lines: ['RE1'], type: 'delay', severity: 'low', message: 'Verzögerungen im Betriebsablauf' },
  { lines: ['S7'], type: 'planned-work', severity: 'medium', message: 'Bauarbeiten am Wochenende' },
];

function generateTransit(rng: Rng): TransitAlert[] {
  const stations = (berlin.dataSources.transit?.stations ?? []).map((s) => s.name);
  return TRANSIT_SCENARIOS.map((s, i) => {
    const station = stations[(i * 2) % stations.length]!;
    const message = `${MARK} ${s.message}`;
    return {
      id: hashString(`${message}:${station}`),
      line: s.lines.join(', '),
      lines: [...s.lines],
      type: s.type,
      severity: s.severity,
      message,
      detail: `${message}. Synthetische Meldung für die lokale Entwicklung; der Verkehr läuft normal.`,
      station,
      location: STATION_COORDS[station] ?? null,
      affectedStops: [station, rng.pick(stations.filter((name) => name !== station))],
    };
  });
}

function generateNina(now: Date): NinaWarning[] {
  const centre = DISTRICTS[0]!;
  const ring = Array.from({ length: 9 }, (_, i) => {
    const angle = ((i % 8) / 8) * 2 * Math.PI;
    return [round(centre.lon + 0.03 * Math.cos(angle), 5), round(centre.lat + 0.018 * Math.sin(angle), 5)];
  });
  return [{
    id: 'mow.synthetic-1',
    version: 1,
    startDate: new Date(now.getTime() - HOUR).toISOString(),
    expiresAt: new Date(now.getTime() + 6 * HOUR).toISOString(),
    severity: 'minor',
    urgency: 'Immediate',
    type: 'Alert',
    source: 'mowas',
    headline: `${MARK} Probewarnung, es besteht keine Gefahr`,
    description: 'Synthetische Warnung für die lokale Entwicklung.',
    instruction: 'Es ist nichts zu tun.',
    area: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} },
  }];
}

/** Rough gauge positions and mean levels (cm) for the configured PEGELONLINE stations. */
const GAUGE_SITES: Record<string, Point & { mw: number }> = {
  'Mühlendamm': { lat: 52.5136, lon: 13.4083, mw: 310 },
  Charlottenburg: { lat: 52.5235, lon: 13.2985, mw: 230 },
  'Köpenick': { lat: 52.4447, lon: 13.5757, mw: 190 },
  Spandau: { lat: 52.5357, lon: 13.2063, mw: 255 },
  'Schmöckwitz': { lat: 52.3753, lon: 13.6476, mw: 180 },
};

interface Gauge { uuid: string; name: string; waterBody: string; tidal: boolean; site: Point & { mw: number }; offset: number; phase: number }

function waterGauges(rng: Rng): Gauge[] {
  const stations = berlin.dataSources.waterLevels?.stations ?? [];
  return stations.map((s, i) => ({
    uuid: s.uuid,
    name: s.name,
    waterBody: s.waterBody,
    tidal: s.tidal ?? false,
    site: GAUGE_SITES[s.name] ?? { ...DISTRICTS[0]!, mw: 250 },
    // One gauge runs high and one low, so every state colour shows up
    offset: i === 1 ? 26 : i === 2 ? -24 : 0,
    phase: rng.float(0, 2 * Math.PI),
  }));
}

function waterStationsAt(rng: Rng, gauges: Gauge[], at: Date): WaterLevelStation[] {
  return gauges.map((g) => {
    const { mw } = g.site;
    const level = Math.round(mw + g.offset + 4 * Math.sin(at.getTime() / (3 * DAY) * 2 * Math.PI + g.phase) + rng.float(-1, 1));
    const state: WaterLevelStation['state'] = level > mw + 35 ? 'very_high' : level > mw + 20 ? 'high' : level < mw - 20 ? 'low' : 'normal';
    return {
      uuid: g.uuid,
      name: g.name,
      waterBody: g.waterBody,
      lat: g.site.lat,
      lon: g.site.lon,
      currentLevel: level,
      timestamp: new Date(at.getTime() - 15 * 60_000).toISOString(),
      state,
      tidal: g.tidal,
      characteristicValues: [
        { shortname: 'MNW', value: mw - 25 },
        { shortname: 'MW', value: mw },
        { shortname: 'MHW', value: mw + 35 },
      ],
    };
  });
}

function generateAppointments(rng: Rng, now: Date): BuergeramtData {
  const today = local(now).date;
  return {
    services: (berlin.dataSources.appointments?.services ?? []).map((s) => {
      const availableDays = rng.chance(0.2) ? 0 : rng.int(1, 12);
      return {
        serviceId: s.id,
        name: s.name,
        earliestDate: availableDays > 0 ? shiftDate(today, rng.int(1, 21)) : null,
        availableDays,
        status: deriveStatus(availableDays),
      };
    }),
    fetchedAt: now.toISOString(),
    bookingUrl: `${EXAMPLE}/appointments`,
  };
}

/** Hauptfunktionen 0–8, the categories the budget tile colours and translates. */
const BUDGET_FUNCTIONS = [
  'Allgemeine Dienste', 'Bildung, Wissenschaft, Kultur', 'Soziale Sicherung', 'Gesundheit, Umwelt, Sport',
  'Wohnungswesen, Städtebau', 'Ernährung, Landwirtschaft', 'Energie, Gewerbe, Dienstleistungen',
  'Verkehr und Nachrichtenwesen', 'Finanzwirtschaft',
];

/** A few Senate Einzelpläne and the functions they spend most on. The Bezirke follow as 31–42, which the tile treats as districts. */
const SENATE_AREAS = [
  { code: 5, name: 'Inneres und Sport', focus: [0, 3] },
  { code: 10, name: 'Bildung, Jugend und Familie', focus: [1] },
  { code: 11, name: 'Arbeit und Soziales', focus: [2] },
  { code: 12, name: 'Stadtentwicklung, Bauen und Wohnen', focus: [4, 7] },
  { code: 15, name: 'Finanzen', focus: [8] },
];

function generateBudget(rng: Rng, now: Date): BudgetSummary {
  const rows: ParsedBudgetRow[] = [];
  const add = (bereich: number, bereichName: string, titelart: ParsedBudgetRow['titelart'], hauptfunktion: number, betrag: number) => {
    rows.push({ bereich, bereichName, hauptfunktion, hauptfunktionName: BUDGET_FUNCTIONS[hauptfunktion]!, titelart, jahr: now.getUTCFullYear(), betrag: Math.round(betrag) });
  };
  for (const area of SENATE_AREAS) {
    BUDGET_FUNCTIONS.forEach((_, f) => {
      const focus = area.focus.includes(f);
      add(area.code, area.name, 'Ausgabetitel', f, (focus ? 2.5e9 : 0.15e9) * rng.float(0.7, 1.3));
      if (focus) add(area.code, area.name, 'Einnahmetitel', f, (area.code === 15 ? 30e9 : 0.3e9) * rng.float(0.8, 1.2));
    });
  }
  DISTRICTS.forEach((d, i) => {
    BUDGET_FUNCTIONS.forEach((_, f) => {
      add(31 + i, d.name, 'Ausgabetitel', f, (f === 1 || f === 2 ? 400e6 : 40e6) * rng.float(0.7, 1.3));
      if (f === 0 || f === 2) add(31 + i, d.name, 'Einnahmetitel', f, 60e6 * rng.float(0.7, 1.3));
    });
  });
  return { ...aggregateBudgetData(rows), fetchedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// Construction, traffic, pharmacies, AEDs
// ---------------------------------------------------------------------------

function generateConstruction(rng: Rng, now: Date): ConstructionSite[] {
  const subtypes: ConstructionSite['subtype'][] = ['construction', 'construction', 'closure', 'disruption'];
  const descriptions: Record<ConstructionSite['subtype'], string> = {
    construction: 'Straßenbauarbeiten, Fahrbahn verengt',
    closure: 'Vollsperrung wegen Leitungsarbeiten',
    disruption: 'Fahrstreifen eingeschränkt',
  };
  return Array.from({ length: 12 }, (_, i): ConstructionSite => {
    const subtype = subtypes[i % subtypes.length]!;
    const start = near(rng, DISTRICTS[i % DISTRICTS.length]!);
    const isFuture = i >= 10;
    const from = now.getTime() + (isFuture ? rng.int(3, 10) : -rng.int(5, 60)) * DAY;
    return {
      id: `synthetic-roadwork-${i + 1}`,
      subtype,
      street: rng.pick(STREETS),
      section: `zwischen ${rng.pick(STREETS)} und ${rng.pick(STREETS)}`,
      description: `${MARK} ${descriptions[subtype]}`,
      direction: rng.pick(['beidseitig', 'stadteinwärts', 'stadtauswärts']),
      validFrom: new Date(from).toISOString(),
      validUntil: new Date(now.getTime() + rng.int(isFuture ? 20 : 7, 120) * DAY).toISOString(),
      isFuture,
      geometry: i % 2 === 0
        ? { type: 'LineString', coordinates: polyline(rng, start, 3) }
        : { type: 'Point', coordinates: [start.lon, start.lat] },
    };
  });
}

const TRAFFIC_KINDS: ReadonlyArray<{ type: TrafficIncident['type']; text: string }> = [
  { type: 'jam', text: 'Stockender Verkehr' },
  { type: 'jam', text: 'Stau' },
  { type: 'accident', text: 'Unfall, ein Fahrstreifen blockiert' },
  { type: 'closure', text: 'Straße gesperrt' },
  { type: 'construction', text: 'Baustelle, Fahrbahn verengt' },
  { type: 'other', text: 'Veranstaltung, viel Verkehr' },
];

const TRAFFIC_SEVERITIES: TrafficIncident['severity'][] = ['low', 'moderate', 'major', 'critical'];

function generateTraffic(rng: Rng, now: Date): TrafficIncident[] {
  return Array.from({ length: 10 }, (_, i): TrafficIncident => {
    const kind = TRAFFIC_KINDS[i % TRAFFIC_KINDS.length]!;
    const lasting = kind.type === 'closure' || kind.type === 'construction';
    return {
      id: `synthetic-traffic-${i + 1}`,
      type: kind.type,
      severity: rng.pick(TRAFFIC_SEVERITIES),
      description: `${MARK} ${kind.text}`,
      road: rng.pick(['A100', 'A111', 'A113', 'B1', 'B2', 'B96', 'B101']),
      from: rng.pick(STREETS),
      to: rng.pick(STREETS),
      delay: kind.type === 'jam' || kind.type === 'accident' ? rng.int(60, 1200) : null,
      length: rng.int(200, 4000),
      geometry: { type: 'LineString', coordinates: polyline(rng, near(rng, rng.pick(DISTRICTS)), rng.int(3, 5)) },
      startTime: new Date(now.getTime() - rng.int(1, 48) * HOUR).toISOString(),
      endTime: lasting ? new Date(now.getTime() + rng.int(1, 14) * DAY).toISOString() : null,
    };
  });
}

function generatePharmacies(rng: Rng, now: Date): EmergencyPharmacy[] {
  const { date: today, hour } = local(now);
  // Emergency duty runs from 9:00 to 9:00 the next morning
  const dutyStart = hour < 9 ? shiftDate(today, -1) : today;
  return DISTRICTS.filter((_, i) => i % 3 !== 2).map((d, i) => ({
    id: `apo-berlin-${i}`,
    name: `Test-Apotheke ${d.name}`,
    address: `${rng.pick(STREETS)} ${rng.int(1, 120)}, ${d.plz} Berlin`,
    district: d.name,
    phone: `030 0000000${i}`,
    location: near(rng, d),
    // Offset-less local time, like the aponet adapter
    validFrom: `${dutyStart}T09:00:00`,
    validUntil: `${shiftDate(dutyStart, 1)}T09:00:00`,
  }));
}

function generateAeds(rng: Rng): AedLocation[] {
  const operators = ['Testverein e. V.', 'Beispiel-Bezirksamt', 'Demo-Verkehrsbetrieb', 'Platzhalter GmbH'];
  return Array.from({ length: 80 }, (_, i): AedLocation => {
    const indoor = rng.chance(0.6);
    return {
      id: `synthetic-aed-${i + 1}`,
      ...near(rng, DISTRICTS[i % DISTRICTS.length]!, 0.02),
      indoor,
      description: `${MARK} Defibrillator ${i + 1}`,
      operator: rng.pick(operators),
      openingHours: indoor ? 'Mo-Fr 08:00-18:00' : '24/7',
      access: rng.pick(['yes', 'public', 'customers']),
    };
  });
}

// ---------------------------------------------------------------------------
// Social atlas and population (choropleth areas)
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<number, string> = { 1: 'hoch', 2: 'mittel', 3: 'niedrig', 4: 'sehr niedrig' };

/** Where the status index is worst; the indices fall off smoothly around these. */
const DEPRIVATION_CENTRES: Point[] = [
  { lat: 52.475, lon: 13.44 }, // north Neukölln
  { lat: 52.55, lon: 13.36 }, // Wedding
  { lat: 52.545, lon: 13.57 }, // Marzahn
  { lat: 52.54, lon: 13.2 }, // Spandau
];

/**
 * Stand-ins for the 542 Planungsräume: Berlin approximated as the ellipse in its
 * bounding box, tiled into ~10 km² rectangles. Dense in the centre, thinning out.
 */
function generateAreas(rng: Rng, now: Date): { socialAtlas: SyntheticData['socialAtlas']; population: SyntheticData['population'] } {
  const { north, south, east, west } = berlin.boundingBox;
  const rows = 12;
  const cols = 15;
  const dLat = (north - south) / rows;
  const dLon = (east - west) / cols;
  const social: SyntheticData['socialAtlas']['features'] = [];
  const people: SyntheticData['population']['geojson']['features'] = [];
  let total = 0;
  let foreign = 0;
  let elderly = 0;
  let youth = 0;
  let areaKm2 = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const lat0 = south + row * dLat;
      const lon0 = west + col * dLon;
      const centre = { lat: lat0 + dLat / 2, lon: lon0 + dLon / 2 };
      const r = Math.hypot((centre.lat - (north + south) / 2) / ((north - south) / 2), (centre.lon - (east + west) / 2) / ((east - west) / 2));
      if (r > 1) continue;

      const index = social.length + 1;
      const cellKm2 = dLat * 111.32 * dLon * 111.32 * Math.cos((centre.lat * Math.PI) / 180);
      const geometry = {
        type: 'Polygon' as const,
        coordinates: [[[lon0, lat0], [lon0 + dLon, lat0], [lon0 + dLon, lat0 + dLat], [lon0, lat0 + dLat], [lon0, lat0]]
          .map(([lon, lat]) => [round(lon!, 5), round(lat!, 5)])],
      };
      const bezId = pad(nearestDistrict(centre) + 1);
      const plrId = `${bezId}99${pad(index, 4)}`;
      const plrName = `Synthetisches Gebiet ${index}`;
      const deprivation = clamp(
        0.1 + DEPRIVATION_CENTRES.reduce((sum, c) => sum + 0.6 * Math.exp(-squaredKm(centre, c) / 32), 0) + rng.float(-0.08, 0.08),
        0, 1,
      );
      const population = Math.round((800 + 11000 * Math.exp(-((r / 0.45) ** 2))) * cellKm2 * rng.float(0.85, 1.15));
      const statusIndex = deprivation < 0.25 ? 1 : deprivation < 0.45 ? 2 : deprivation < 0.65 ? 3 : 4;

      social.push({
        type: 'Feature',
        geometry,
        properties: {
          plrId,
          plrName,
          bezId,
          population,
          statusIndex,
          statusLabel: STATUS_LABELS[statusIndex]!,
          unemployment: round(2 + 14 * deprivation, 1),
          singleParent: round(18 + 30 * deprivation + rng.float(-3, 3), 1),
          welfare: round(3 + 30 * deprivation, 1),
          childPoverty: round(5 + 45 * deprivation, 1),
        },
      });

      const foreignPct = round(clamp(10 + 25 * (1 - r) + 10 * deprivation + rng.float(-3, 3), 2, 60), 1);
      const elderlyPct = round(clamp(13 + 12 * r + rng.float(-3, 3), 5, 40), 1);
      const youthPct = round(clamp(14 + 4 * deprivation + rng.float(-2, 2), 8, 30), 1);
      people.push({
        type: 'Feature',
        geometry,
        properties: { plrId, plrName, population, density: Math.round(population / cellKm2), foreignPct, elderlyPct, youthPct },
      });

      total += population;
      foreign += (population * foreignPct) / 100;
      elderly += (population * elderlyPct) / 100;
      youth += (population * youthPct) / 100;
      areaKm2 += cellKm2;
    }
  }

  const elderlyPct = round((elderly / total) * 100, 1);
  const youthPct = round((youth / total) * 100, 1);
  const changePct = round(rng.float(0.1, 0.6), 2);
  return {
    socialAtlas: { type: 'FeatureCollection', features: social },
    population: {
      geojson: { type: 'FeatureCollection', features: people },
      summary: {
        total,
        density: Math.round(total / areaKm2),
        foreignTotal: Math.round(foreign),
        foreignPct: round((foreign / total) * 100, 1),
        elderlyPct,
        youthPct,
        workingAgePct: round(100 - elderlyPct - youthPct, 1),
        changeAbsolute: Math.round((total * changePct) / 100),
        changePct,
        snapshotDate: populationSnapshotDate(now),
      },
    },
  };
}

/** The latest half-year snapshot (30 June / 31 December) that would be published by now, ~3 months on. */
function populationSnapshotDate(now: Date): string {
  const cutoff = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10);
  const year = now.getUTCFullYear();
  return [`${year}-06-30`, `${year - 1}-12-31`, `${year - 1}-06-30`].find((d) => d <= cutoff)!;
}

// ---------------------------------------------------------------------------
// Health, labour, fire brigade, noise, council, politics
// ---------------------------------------------------------------------------

const PATHOGENS = [
  { name: 'Influenza A', peak: 60_000 },
  { name: 'Influenza B', peak: 12_000 },
  { name: 'RSV', peak: 40_000 },
  { name: 'SARS-CoV-2', peak: 250_000 },
];

function generateWastewater(rng: Rng, now: Date): WastewaterSummary {
  const today = local(now).date;
  return {
    sampleDate: shiftDate(today, -4),
    plantCount: 3,
    pathogens: PATHOGENS.map((p) => {
      const phase = rng.float(0, 2 * Math.PI);
      const history = Array.from({ length: 12 }, (_, week) =>
        Math.round(p.peak * (0.55 + 0.45 * Math.sin(phase + week / 2)) * rng.float(0.85, 1.15)));
      const value = history[11]!;
      const previousValue = history[10]!;
      return {
        name: p.name,
        value,
        previousValue,
        trend: computeTrend(value, previousValue),
        level: computeLevel(value, Math.max(...history)),
        history,
        // AMELAG publishes SARS-CoV-2 about a week after Lageso's sample date
        ...(p.name === 'SARS-CoV-2' ? { sampleDate: shiftDate(today, -9) } : {}),
      };
    }),
  };
}

const BATHING_SITES: ReadonlyArray<Point & { place: string; district: string; waterBody: string }> = [
  { place: 'Wannsee', district: 'Steglitz-Zehlendorf', waterBody: 'Unterhavel', lat: 52.438, lon: 13.179 },
  { place: 'Müggelsee', district: 'Treptow-Köpenick', waterBody: 'Müggelsee', lat: 52.441, lon: 13.648 },
  { place: 'Plötzensee', district: 'Mitte', waterBody: 'Plötzensee', lat: 52.544, lon: 13.329 },
  { place: 'Tegeler See', district: 'Reinickendorf', waterBody: 'Tegeler See', lat: 52.583, lon: 13.264 },
  { place: 'Schlachtensee', district: 'Steglitz-Zehlendorf', waterBody: 'Schlachtensee', lat: 52.44, lon: 13.215 },
  { place: 'Krumme Lanke', district: 'Steglitz-Zehlendorf', waterBody: 'Krumme Lanke', lat: 52.448, lon: 13.227 },
  { place: 'Weißer See', district: 'Pankow', waterBody: 'Weißer See', lat: 52.553, lon: 13.466 },
  { place: 'Orankesee', district: 'Lichtenberg', waterBody: 'Orankesee', lat: 52.548, lon: 13.495 },
];

function generateBathing(rng: Rng, now: Date): BathingSpot[] {
  const today = local(now).date;
  const monthDay = today.slice(5);
  // The same season as ingest-bathing: 15 May to 15 September
  const inSeason = monthDay >= '05-15' && monthDay <= '09-15';
  const year = Number(today.slice(0, 4));
  const lastSample = inSeason ? today : `${monthDay > '09-15' ? year : year - 1}-09-10`;
  return BATHING_SITES.map((s, i): BathingSpot => {
    const quality: BathingSpot['quality'] = i === 3 ? 'warning' : 'good';
    return {
      id: `bath-synthetic-${i + 1}`,
      name: `Badestelle ${s.place} (synthetisch)`,
      district: s.district,
      waterBody: s.waterBody,
      lat: s.lat,
      lon: s.lon,
      measuredAt: shiftDate(lastSample, -rng.int(1, 6)),
      waterTemp: round(inSeason ? rng.float(18, 24) : rng.float(15, 18), 1),
      visibility: round(rng.float(0.5, 3), 1),
      quality,
      algae: quality === 'warning' ? 'Blaualgen in geringer Menge (synthetisch)' : null,
      advisory: quality === 'warning' ? 'Synthetischer Hinweis: Baden nicht empfohlen.' : null,
      classification: rng.pick(['ausgezeichnet', 'gut']),
      detailUrl: `${EXAMPLE}/bathing/${i + 1}`,
      inSeason,
    };
  });
}

/** One month of BA figures; `monthsBack` moves the rate along a slow curve so the trend chart has a shape. */
function laborMarketFor(rng: Rng, reportMonth: string, monthsBack: number): LaborMarketSummary {
  const rate = round(9.6 + 0.4 * Math.sin(monthsBack / 4) + rng.float(-0.1, 0.1), 1);
  const totalUnemployed = Math.round(2_100_000 * rate / 100);
  const yoy = (count: number) => {
    const percent = round(rng.float(-2, 5), 1);
    return { percent, absolute: Math.round((count * percent) / (100 + percent)) };
  };
  const sgbIICount = Math.round(totalUnemployed * 0.68);
  const underemploymentCount = Math.round(totalUnemployed * 1.27);
  const all = yoy(totalUnemployed);
  const sgbII = yoy(sgbIICount);
  const under = yoy(underemploymentCount);
  return {
    unemploymentRate: rate,
    totalUnemployed,
    yoyChangeAbsolute: all.absolute,
    yoyChangePercent: all.percent,
    sgbIIRate: round(rate * 0.68, 1),
    sgbIICount,
    sgbIIYoyAbsolute: sgbII.absolute,
    sgbIIYoyPercent: sgbII.percent,
    underemploymentRate: round(rate * 1.25, 1),
    underemploymentCount,
    underemploymentYoyAbsolute: under.absolute,
    underemploymentYoyPercent: under.percent,
    reportMonth,
  };
}

function feuerwehrMonth(rng: Rng, reportMonth: string, share = 1): FeuerwehrMonthData {
  const scaled = (min: number, max: number) => Math.round(rng.int(min, max) * share);
  const ems = scaled(36_000, 40_000);
  const fire = scaled(2_200, 3_200);
  const rescue = scaled(1_000, 1_600);
  return {
    reportMonth,
    missionCountAll: ems + fire + rescue + scaled(1_500, 2_500),
    missionCountEms: ems,
    missionCountFire: fire,
    missionCountTechnicalRescue: rescue,
    responseTimeEmsCriticalMedian: rng.int(540, 640),
    responseTimeFirePumpMedian: rng.int(450, 540),
  };
}

function generateFeuerwehr(rng: Rng, now: Date): FeuerwehrSummary {
  const today = local(now).date;
  const thisMonth = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8, 10));
  return {
    current: feuerwehrMonth(rng, shiftMonth(thisMonth, -1)),
    // The open-data CSV has no row for a month on its first day
    partial: dayOfMonth > 1 ? feuerwehrMonth(rng, thisMonth, dayOfMonth / 30) : null,
    previous: feuerwehrMonth(rng, shiftMonth(thisMonth, -2)),
  };
}

/** Months (1–12) in which each pollen type flies around Berlin. */
const POLLEN_SEASONS: Record<PollenType, readonly number[]> = {
  Hasel: [1, 2, 3], Erle: [2, 3, 4], Esche: [3, 4, 5], Birke: [4, 5],
  Graeser: [5, 6, 7, 8], Roggen: [5, 6, 7], Beifuss: [7, 8, 9], Ambrosia: [8, 9, 10],
};

const ACTIVE_POLLEN: PollenIntensity[] = ['0-1', '1', '1-2', '2', '2-3'];

function generatePollen(rng: Rng, now: Date): PollenForecast {
  const today = local(now).date;
  const month = Number(today.slice(5, 7));
  const level = (type: PollenType): PollenIntensity => (POLLEN_SEASONS[type].includes(month) ? rng.pick(ACTIVE_POLLEN) : '0');
  const pollen = Object.fromEntries((Object.keys(POLLEN_SEASONS) as PollenType[]).map((type): [PollenType, PollenTypeForecast] =>
    [type, { today: level(type), tomorrow: level(type), dayAfterTomorrow: level(type) }])) as Record<PollenType, PollenTypeForecast>;
  return { region: 'Brandenburg und Berlin', updatedAt: `${today} 11:00 Uhr`, pollen };
}

function generateNoiseSensors(rng: Rng): NoiseSensor[] {
  // The inner Bezirke, where most DNMS sensors are
  const inner = [0, 1, 2, 3, 6, 7, 10];
  return Array.from({ length: 15 }, (_, i): NoiseSensor => {
    const laeq = round(rng.float(48, 72), 1);
    return {
      id: 990_001 + i,
      ...near(rng, DISTRICTS[inner[i % inner.length]!]!, 0.02),
      laeq,
      laMin: round(laeq - rng.float(8, 15), 1),
      laMax: round(laeq + rng.float(10, 25), 1),
    };
  });
}

const COMMITTEES = [
  'Bezirksverordnetenversammlung', 'Ausschuss für Stadtentwicklung', 'Ausschuss für Schule und Sport',
  'Haushaltsausschuss', 'Ausschuss für Umwelt und Natur',
];

function generateCouncilMeetings(rng: Rng, now: Date): CouncilMeeting[] {
  const today = local(now).date;
  const agenda = [
    { number: 'Ö 1', name: `${MARK} Eröffnung und Tagesordnung`, public: true },
    { number: 'Ö 2', name: `${MARK} Bericht des Bezirksamts`, public: true },
    { number: 'NÖ 1', name: `${MARK} Nichtöffentliche Testvorlage`, public: false },
  ];
  // OParl/PARDOK give local times with their UTC offset
  const at = (date: string, hour: number) => `${date}T${pad(hour)}:00:00${berlinUtcOffset(`${date}T${pad(hour)}:00:00`)}`;
  const bvv = (berlin.dataSources.councilMeetings?.bvv ?? []).map((b, i): CouncilMeeting => {
    const date = shiftDate(today, 1 + ((i * 3) % 13));
    const hour = rng.int(16, 18);
    return {
      id: `synthetic-bvv-${i + 1}`,
      source: 'bvv',
      district: b.district,
      committee: rng.pick(COMMITTEES),
      start: at(date, hour),
      end: at(date, hour + 3),
      location: `Sitzungssaal (synthetisch), ${rng.pick(STREETS)} 1`,
      agendaItems: agenda,
      webUrl: `${EXAMPLE}/council/bvv-${i + 1}`,
    };
  });
  const parliament = ['Plenarsitzung', 'Ausschuss für Mobilität'].map((committee, i): CouncilMeeting => {
    const date = shiftDate(today, 2 + i * 5);
    return {
      id: `synthetic-parliament-${i + 1}`,
      source: 'parliament',
      committee,
      start: at(date, 10),
      end: at(date, 14),
      location: 'Plenarsaal (synthetisch)',
      webUrl: `${EXAMPLE}/council/parliament-${i + 1}`,
    };
  });
  return [...bvv, ...parliament].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

const PARTIES = ['CDU', 'SPD', 'Grüne', 'Die Linke', 'AfD', 'FDP', 'BSW'];

/** All four levels use the Bezirk names the map's district boundaries carry. */
function generatePolitical(rng: Rng): Record<PoliticalLevel, PoliticalDistrict[]> {
  let count = 0;
  const person = (party: string, role: string, constituency?: string): Representative => {
    count++;
    return {
      name: `Testperson ${pad(count, 3)}`,
      party,
      role,
      profileUrl: `${EXAMPLE}/people/${count}`,
      ...(constituency ? { constituency } : {}),
    };
  };
  const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');

  const bezirke = DISTRICTS.map((d): PoliticalDistrict => ({
    id: `bm-${slug(d.name)}`,
    name: d.name,
    level: 'bezirk',
    representatives: [person(rng.pick(PARTIES.slice(0, 4)), 'Bezirksbürgermeister:in')],
  }));
  const bundestag = DISTRICTS.map((d): PoliticalDistrict => {
    const name = `Berlin-${d.name}`;
    return { id: `bundestag-${slug(name)}`, name, level: 'bundestag', representatives: [person(rng.pick(PARTIES), 'MdB', name)] };
  });
  const stateReps = DISTRICTS.map((d) => [1, 2].map((n) => person(rng.pick(PARTIES), 'MdA', `${d.name} ${n}`)));
  const state = stateReps.flat().map((rep): PoliticalDistrict => ({
    id: `state-${slug(rep.constituency!)}`,
    name: rep.constituency!,
    level: 'landesparlament',
    representatives: [rep],
  }));
  const stateBezirke = DISTRICTS.map((d, i): PoliticalDistrict => ({
    id: `state-bezirk-${slug(d.name)}`,
    name: d.name,
    level: 'landesparlament',
    representatives: stateReps[i]!,
  }));
  return { bezirke, bundestag, state, 'state-bezirke': stateBezirke };
}
