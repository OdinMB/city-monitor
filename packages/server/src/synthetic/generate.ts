/**
 * Synthetic data for the dev database: one plausible, obviously made-up data
 * set for one configured city. Berlin's covers every dashboard tile and map
 * layer; another city's covers what production would hold for it (see
 * syntheticCoverage). Timestamps are relative to `now`, so freshness checks
 * see the data as current, and the output is the same for the same city, seed
 * and `now`.
 *
 * Shapes come from the shared types and, where the ingestion code has them,
 * its helpers, so a schema change surfaces here as a type error or a test
 * failure. Text is German like the real sources and marked "[Synthetisch]";
 * links go to example.com; people are "Testperson NNN".
 */

import SunCalc from 'suncalc';
import type {
  AedLocation, AirQuality, AirQualityGridPoint, AirQualityStation, BathingSpot, BikeSharingData, BikeStation, BudgetSummary, BuergeramtData,
  CityConfig, CityEvent, ConstructionSite, CouncilMeeting, CurrentWeather, DailyForecast, ElectricityData, EmergencyPharmacy,
  CitizenReport, CitizenReportData, GridPoint, GridSignal, SoilMoistureData,
  FeuerwehrMonthData, FloodClass, FloodStatus, FeuerwehrSummary, HourlyForecast, LaborMarketSummary, LiftOutage,
  LiftOutageData, NinaWarning,
  NoiseSensor, PoliticalDistrict, PollenForecast, PollenIntensity, PollenType, PollenTypeForecast,
  PopulationFeatureProps, PopulationSummary, Representative, SafetyReport, SocialAtlasFeatureProps,
  TelraamCountsData, TelraamSegmentCount, TrafficAccident, TrafficAccidentData, TrafficCountData, TrafficCountSite, TrafficIncident, TransitAlert, RespiratoryCases, WastewaterSummary, WaterLevelData, WaterLevelStation, WeatherData,
} from '@city-monitor/shared';
import type { HeatReliefData, HeatReliefPlace } from '@city-monitor/shared';
import { berlin } from '../config/cities/berlin.js';
import type { SnapshotType } from '../db/schema.js';
import type { PersistedNewsItem } from '../db/writes.js';
import type { EvChargingRegister, RegisterStation } from '../lib/ev-charging.js';
import { aggregateBudgetData, type ParsedBudgetRow } from '../cron/ingest-budget.js';
import { deriveStatus } from '../cron/ingest-appointments.js';
import { berlinUtcOffset } from '../cron/ingest-council-meetings.js';
import { hasPharmacySearch } from '../cron/ingest-pharmacies.js';
import { hasTransitSource } from '../cron/ingest-transit.js';
import {
  PARLIAMENT_CONFIG, groupsStateMembersByBezirk, handKeptAreas, hasDistrictMayors, hasMayor, hasParliamentConfig,
} from '../cron/ingest-political.js';
import { computeLevel, computeTrend } from '../cron/ingest-wastewater.js';
import { isoWeekLabel, isoWeekMonday } from '../cron/ingest-respiratory-cases.js';
import { REPORT_WINDOW_DAYS, buildCitizenReportData, reportGroup, reportStatus, requestPageUrl } from '../cron/ingest-citizen-reports.js';
import { hashString } from '../lib/hash.js';
import { SOCIAL_ATLAS_HAS_STATUS_INDEX, SOCIAL_ATLAS_METRICS } from '../lib/social-atlas-parsers.js';

export interface SyntheticSnapshot {
  type: SnapshotType;
  fetchedAt: Date;
  data: unknown;
}

export interface PolygonFeatureCollection<P> {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; geometry: { type: 'Polygon'; coordinates: number[][][] }; properties: P }>;
}

export type PoliticalLevel = 'bezirke' | 'mayor' | 'bundestag' | 'state' | 'state-bezirke';

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
  /** RKI IfSG flu and RSV cases: only a city-state has them. */
  respiratoryCases?: RespiratoryCases;
  bathing: BathingSpot[];
  laborMarket: LaborMarketSummary;
  feuerwehr: FeuerwehrSummary;
  pollen: PollenForecast;
  noiseSensors: NoiseSensor[];
  councilMeetings: CouncilMeeting[];
  /** Berlin's full set has every level but `mayor`, which only a city inside a state has. */
  political: Record<Exclude<PoliticalLevel, 'mayor'>, PoliticalDistrict[]> & { mayor?: PoliticalDistrict[] };
  /** Not in Berlin's data set: Berlin has no LHP gauges configured (NOT_IN_BERLIN). */
  floodStatus?: FloodStatus;
  /** Not in Berlin's data set: only Köln's KVB publishes lift outages (NOT_IN_BERLIN). */
  liftOutages?: LiftOutageData;
  bikeSharing: BikeSharingData;
  electricity: ElectricityData;
  /** Official stations (UBA), one per configured station code. */
  airQualityStations: AirQualityStation[];
  /** Not in Berlin's data set: only Köln and München have an Open311 server (NOT_IN_BERLIN). */
  citizenReports?: CitizenReportData;
  trafficAccidents: TrafficAccidentData;
  /** Not in Berlin's data set: only Hamburg's counters are configured (NOT_IN_BERLIN). */
  trafficCounts?: TrafficCountData;
  /** The register only: the live status (Hamburg) is never stored, so the seed has none. */
  evCharging: EvChargingRegister;
  heatRelief: HeatReliefData;
  /** Soil moisture at the configured DWD stations; Gieß den Kiez waterings where the city has them. */
  soilMoisture: SoilMoistureData;
  telraamCounts: TelraamCountsData;
  /** Older snapshots behind the history endpoints (weather, water levels, labor market), oldest first. */
  history: SyntheticSnapshot[];
}

/** One data set of a city's dashboard: a tile's or a map layer's data. */
export type SyntheticDataSet = Exclude<keyof SyntheticData, 'cityId' | 'history'>;

/**
 * One city's data set: the data sets production would hold for it, the
 * others absent (seedDatabase writes nothing for them), and of the political
 * levels the ones production fills for it.
 */
export type CitySyntheticData = Pick<SyntheticData, 'cityId' | 'history'>
  & Partial<Omit<SyntheticData, 'cityId' | 'history' | 'political'>>
  & { political?: Partial<SyntheticData['political']> };

const berlinOnly = (city: CityConfig) => city.id === 'berlin';

/**
 * Whether production holds each data set for a city: the condition its
 * ingestion job checks (packages/server/src/cron/ingest-*.ts). Jobs whose
 * source covers Berlin only write for Berlin alone; political follows
 * POLITICAL below.
 */
const COVERED: Record<SyntheticDataSet, (city: CityConfig) => boolean> = {
  news: (c) => c.feeds.length > 0,
  summary: (c) => c.feeds.length > 0,
  events: (c) => (c.dataSources.events?.length ?? 0) > 0,
  safety: (c) => c.dataSources.police !== undefined,
  // ingest-weather has an adapter for this provider only
  weather: (c) => c.dataSources.weather.provider === 'brightsky',
  airQuality: () => true,
  airQualityGrid: () => true,
  // ingest-transit skips a city with no stations to ask; Geofox runs where production has its credentials
  transit: hasTransitSource,
  nina: (c) => c.country === 'DE' && c.dataSources.nina !== undefined,
  waterLevels: (c) => c.dataSources.waterLevels !== undefined,
  appointments: (c) => c.dataSources.appointments !== undefined,
  budget: (c) => c.dataSources.budget !== undefined,
  construction: (c) => c.dataSources.roadworks !== undefined,
  traffic: () => true,
  pharmacies: hasPharmacySearch,
  aeds: (c) => c.country === 'DE',
  socialAtlas: (c) => c.dataSources.socialAtlas !== undefined,
  population: (c) => c.dataSources.population !== undefined,
  wastewater: (c) => c.dataSources.wastewater !== undefined,
  bathing: (c) => c.dataSources.bathing !== undefined,
  laborMarket: (c) => c.dataSources.laborMarket !== undefined,
  feuerwehr: berlinOnly,
  pollen: (c) => c.dataSources.pollen !== undefined,
  noiseSensors: (c) => c.dataSources.noiseSensors !== undefined,
  councilMeetings: (c) => c.dataSources.councilMeetings !== undefined,
  political: (c) => politicalLevels(c).length > 0,
  floodStatus: (c) => (c.dataSources.floodStatus?.stations.length ?? 0) > 0,
  liftOutages: (c) => c.dataSources.liftOutages !== undefined,
  bikeSharing: (c) => c.dataSources.bikeSharing !== undefined,
  electricity: (c) => c.dataSources.electricity !== undefined,
  airQualityStations: (c) => (c.dataSources.airQuality?.ubaStations?.length ?? 0) > 0,
  citizenReports: (c) => c.dataSources.citizenReports !== undefined,
  trafficAccidents: (c) => c.dataSources.trafficAccidents !== undefined,
  trafficCounts: (c) => (c.dataSources.trafficCounts?.modes.length ?? 0) > 0,
  evCharging: (c) => c.dataSources.evCharging !== undefined,
  heatRelief: (c) => (c.dataSources.heatRelief?.length ?? 0) > 0,
  soilMoisture: (c) => (c.dataSources.soilMoisture?.stations.length ?? 0) > 0,
  telraamCounts: (c) => c.dataSources.telraamCounts !== undefined,
  respiratoryCases: (c) => c.dataSources.respiratoryCases !== undefined,
};

/** Data sets whose source Berlin's config does not have, so Berlin's data set lacks them. */
const NOT_IN_BERLIN: readonly SyntheticDataSet[] = ['floodStatus', 'liftOutages', 'citizenReports', 'trafficCounts'];

/** The data sets the synthetic seed writes for `city`: those production would hold for it. */
export function syntheticCoverage(city: CityConfig): SyntheticDataSet[] {
  return (Object.keys(COVERED) as SyntheticDataSet[]).filter((set) => COVERED[set](city));
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

/** Berlin's data set, which covers every data set but those of NOT_IN_BERLIN. */
export function generateSyntheticData(options: { now: Date; seed?: number }): SyntheticData {
  const data = generateSyntheticCityData({ ...options, city: berlin });
  const missing = (Object.keys(COVERED) as SyntheticDataSet[])
    .filter((set) => !NOT_IN_BERLIN.includes(set) && data[set] === undefined);
  if (missing.length > 0) throw new Error(`the synthetic Berlin data set lacks ${missing.join(', ')}`);
  return data as SyntheticData;
}

/**
 * The data set for `city`: the data sets production would hold for it
 * (syntheticCoverage), placed inside its bounding box. Places are its Bezirke
 * where the web app ships their boundaries, otherwise points spread over the
 * city with no district names. Local dates and times are Berlin wall-clock
 * time, which every configured city keeps.
 */
export function generateSyntheticCityData(options: { now: Date; seed?: number; city: CityConfig }): CitySyntheticData {
  const { now, seed = 1, city } = options;
  const has = new Set(syntheticCoverage(city));
  const place = placeOf(city);
  // One stream for everything, drawn in this order: a data set depends on the ones drawn before it
  const rng = createRng(seed);
  const weatherModel = createWeatherModel(rng);
  const areas = has.has('socialAtlas') || has.has('population') ? generateAreas(rng, now, place) : undefined;
  const news = has.has('news') ? generateNews(rng, now, place) : undefined;

  const aqStations = has.has('airQualityGrid') ? airQualityStations(rng, place) : [];
  const gauges = has.has('waterLevels') ? waterGauges(rng, place) : [];

  const history: SyntheticSnapshot[] = [];
  for (let h = 167; h >= 1; h--) {
    const at = new Date(now.getTime() - h * HOUR);
    if (has.has('weather')) history.push({ type: 'open-meteo', fetchedAt: at, data: { current: currentWeather(rng, weatherModel, at), hourly: [], daily: [], alerts: [] } });
    if (has.has('waterLevels')) history.push({ type: 'pegelonline', fetchedAt: at, data: { stations: waterStationsAt(rng, gauges, at) } });
  }
  const thisMonth = local(now).date.slice(0, 7);
  if (has.has('laborMarket')) {
    for (let k = 23; k >= 1; k--) {
      const fetchedAt = new Date(`${shiftMonth(thisMonth, -k)}-05T08:00:00Z`);
      history.push({ type: 'ba-labor-market', fetchedAt, data: laborMarketFor(rng, shiftMonth(thisMonth, -k - 1), k) });
    }
  }
  history.sort((a, b) => a.fetchedAt.getTime() - b.fetchedAt.getTime());

  const sets: Omit<CitySyntheticData, 'cityId' | 'history'> = {};
  if (news) sets.news = news;
  if (news && has.has('summary')) sets.summary = generateSummary(news, now, seed, city);
  if (has.has('events')) sets.events = generateEvents(rng, now, place);
  if (has.has('safety')) sets.safety = generateSafety(rng, now, place);
  if (has.has('weather')) sets.weather = generateWeather(rng, weatherModel, now, place);
  if (has.has('airQuality')) sets.airQuality = generateSyntheticAirQuality({ now, seed });
  if (has.has('airQualityGrid')) sets.airQualityGrid = airQualityGridAt(rng, aqStations, now);
  if (has.has('transit')) sets.transit = generateTransit(rng, city);
  if (has.has('nina')) sets.nina = generateNina(now, place);
  if (has.has('waterLevels')) sets.waterLevels = { stations: waterStationsAt(rng, gauges, now), fetchedAt: now.toISOString() };
  if (has.has('appointments')) sets.appointments = generateAppointments(rng, now, city);
  if (has.has('budget')) sets.budget = generateBudget(rng, now, place);
  if (has.has('construction')) sets.construction = generateConstruction(rng, now, place);
  if (has.has('traffic')) sets.traffic = generateTraffic(rng, now, place);
  if (has.has('pharmacies')) sets.pharmacies = generatePharmacies(rng, now, place);
  if (has.has('aeds')) sets.aeds = generateAeds(rng, place);
  if (areas && has.has('socialAtlas')) sets.socialAtlas = areas.socialAtlas;
  if (areas && has.has('population')) sets.population = areas.population;
  if (has.has('wastewater')) sets.wastewater = generateWastewater(rng, now, city.dataSources.wastewater!);
  if (has.has('bathing')) sets.bathing = generateBathing(rng, now, place);
  if (has.has('laborMarket')) sets.laborMarket = laborMarketFor(rng, shiftMonth(thisMonth, -1), 0);
  if (has.has('feuerwehr')) sets.feuerwehr = generateFeuerwehr(rng, now);
  if (has.has('pollen')) sets.pollen = generatePollen(rng, now, place);
  if (has.has('noiseSensors')) sets.noiseSensors = generateNoiseSensors(rng, place);
  if (has.has('councilMeetings')) sets.councilMeetings = generateCouncilMeetings(rng, now, place);
  if (has.has('political')) sets.political = generatePolitical(rng, place);
  // Drawn last, so adding it left the other data sets' values as they were
  if (has.has('floodStatus')) sets.floodStatus = generateFloodStatus(rng, now, city);
  if (has.has('liftOutages')) sets.liftOutages = generateLiftOutages(rng, now, place);
  if (has.has('bikeSharing')) sets.bikeSharing = generateBikeSharing(rng, now, city, place);
  if (has.has('electricity')) sets.electricity = generateElectricity(rng, now, city.dataSources.electricity!.controlArea);
  if (has.has('airQualityStations')) sets.airQualityStations = generateAirQualityStations(rng, now, place);
  if (has.has('citizenReports')) sets.citizenReports = generateCitizenReports(rng, now, place);
  if (has.has('trafficAccidents')) sets.trafficAccidents = generateTrafficAccidents(rng, now, place);
  if (has.has('trafficCounts')) sets.trafficCounts = generateTrafficCounts(rng, now, city, place);
  if (has.has('evCharging')) sets.evCharging = generateEvCharging(rng, place);
  if (has.has('heatRelief')) sets.heatRelief = generateHeatRelief(rng, city, place);
  if (has.has('soilMoisture')) sets.soilMoisture = generateSoilMoisture(rng, now, city, place);
  if (has.has('telraamCounts')) sets.telraamCounts = generateTelraamCounts(rng, now, place);
  if (has.has('respiratoryCases')) sets.respiratoryCases = generateRespiratoryCases(rng, now);
  return { cityId: city.id, ...sets, history };
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

/** A Bezirk: its name as the web app's boundary file has it, a rough centre and a postcode in it. */
interface District extends Point { name: string; plz: string }

/** Berlin's twelve Bezirke in official order (index + 1 is the bezId), with rough centre points. */
const DISTRICTS: readonly District[] = [
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

/** Hamburg's seven Bezirke in official order, with rough centre points. */
const HAMBURG_DISTRICTS: readonly District[] = [
  { name: 'Hamburg-Mitte', lat: 53.548, lon: 10.010, plz: '20095' },
  { name: 'Altona', lat: 53.565, lon: 9.880, plz: '22765' },
  { name: 'Eimsbüttel', lat: 53.600, lon: 9.940, plz: '20259' },
  { name: 'Hamburg-Nord', lat: 53.600, lon: 10.030, plz: '22297' },
  { name: 'Wandsbek', lat: 53.620, lon: 10.120, plz: '22041' },
  { name: 'Bergedorf', lat: 53.470, lon: 10.210, plz: '21029' },
  { name: 'Harburg', lat: 53.460, lon: 9.930, plz: '21073' },
];

/** Köln's nine Stadtbezirke in official order, with points inside each. */
const KOELN_DISTRICTS: readonly District[] = [
  { name: 'Innenstadt', lat: 50.937, lon: 6.960, plz: '50667' },
  { name: 'Rodenkirchen', lat: 50.877, lon: 6.964, plz: '50996' },
  { name: 'Lindenthal', lat: 50.930, lon: 6.862, plz: '50931' },
  { name: 'Ehrenfeld', lat: 50.970, lon: 6.891, plz: '50823' },
  { name: 'Nippes', lat: 50.990, lon: 6.938, plz: '50733' },
  { name: 'Chorweiler', lat: 51.031, lon: 6.876, plz: '50765' },
  { name: 'Porz', lat: 50.873, lon: 7.086, plz: '51143' },
  { name: 'Kalk', lat: 50.934, lon: 7.079, plz: '51103' },
  { name: 'Mülheim', lat: 50.985, lon: 7.030, plz: '51063' },
];

/** München's 25 Stadtbezirke in official order, with points inside each. */
const MUENCHEN_DISTRICTS: readonly District[] = [
  { name: 'Altstadt-Lehel', lat: 48.139, lon: 11.581, plz: '80331' },
  { name: 'Ludwigsvorstadt-Isarvorstadt', lat: 48.130, lon: 11.558, plz: '80469' },
  { name: 'Maxvorstadt', lat: 48.148, lon: 11.565, plz: '80333' },
  { name: 'Schwabing-West', lat: 48.166, lon: 11.570, plz: '80796' },
  { name: 'Au-Haidhausen', lat: 48.130, lon: 11.595, plz: '81667' },
  { name: 'Sendling', lat: 48.114, lon: 11.547, plz: '81371' },
  { name: 'Sendling-Westpark', lat: 48.117, lon: 11.521, plz: '81373' },
  { name: 'Schwanthalerhöhe', lat: 48.136, lon: 11.539, plz: '80339' },
  { name: 'Neuhausen-Nymphenburg', lat: 48.156, lon: 11.519, plz: '80639' },
  { name: 'Moosach', lat: 48.182, lon: 11.505, plz: '80992' },
  { name: 'Milbertshofen-Am Hart', lat: 48.215, lon: 11.575, plz: '80807' },
  { name: 'Schwabing-Freimann', lat: 48.194, lon: 11.611, plz: '80805' },
  { name: 'Bogenhausen', lat: 48.155, lon: 11.643, plz: '81675' },
  { name: 'Berg am Laim', lat: 48.127, lon: 11.632, plz: '81673' },
  { name: 'Trudering-Riem', lat: 48.125, lon: 11.677, plz: '81825' },
  { name: 'Ramersdorf-Perlach', lat: 48.100, lon: 11.638, plz: '81737' },
  { name: 'Obergiesing-Fasangarten', lat: 48.103, lon: 11.592, plz: '81539' },
  { name: 'Untergiesing-Harlaching', lat: 48.097, lon: 11.565, plz: '81545' },
  { name: 'Thalkirchen-Obersendling-Forstenried-Fürstenried-Solln', lat: 48.084, lon: 11.516, plz: '81475' },
  { name: 'Hadern', lat: 48.115, lon: 11.485, plz: '81375' },
  { name: 'Pasing-Obermenzing', lat: 48.157, lon: 11.467, plz: '81241' },
  { name: 'Aubing-Lochhausen-Langwied', lat: 48.164, lon: 11.408, plz: '81243' },
  { name: 'Allach-Untermenzing', lat: 48.193, lon: 11.458, plz: '80999' },
  { name: 'Feldmoching-Hasenbergl', lat: 48.212, lon: 11.522, plz: '80933' },
  { name: 'Laim', lat: 48.135, lon: 11.505, plz: '80686' },
];

/** What a city needs beyond its config: names and positions the generator would otherwise make up badly. */
interface CityDetails {
  /** Its Bezirke, for a city whose Bezirk boundaries the web app ships (packages/web/src/data/districts). */
  districts: readonly District[];
  /** Dialling code of the pharmacies' made-up numbers. */
  phonePrefix: string;
  /** Roads the traffic incidents pick from. */
  roads: readonly string[];
  /** The DWD pollen region's name, as the pollen ingestion stores it. */
  pollenRegion: string;
  /** Rough positions and mean levels (cm) of the configured PEGELONLINE gauges, by gauge name. */
  gauges: Readonly<Record<string, Point & { mw: number }>>;
  /** Where the social atlas's status index is worst. */
  deprivationCentres: readonly Point[];
}

/** A point per compass direction around the centre and the centre first, named after the city: places for a city without Bezirke. */
function spreadPoints(city: CityConfig): Array<Point & { name: string }> {
  const { north, south, east, west } = city.boundingBox;
  const { lat, lon } = city.coordinates;
  const ring = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * 2 * Math.PI;
    return { lat: round(lat + 0.2 * (north - south) * Math.sin(angle), 5), lon: round(lon + 0.2 * (east - west) * Math.cos(angle), 5) };
  });
  return [{ lat, lon }, ...ring].map((p) => ({ ...p, name: city.name }));
}

/** Everything the generators place things by, for one city. */
interface Place {
  city: CityConfig;
  /** Its Bezirke, or none for a city without (see CityDetails). */
  districts: readonly District[];
  /** Where things go and what they are named after: the Bezirke, or spreadPoints when there are none. */
  anchors: ReadonlyArray<Point & { name: string; plz?: string }>;
  details: CityDetails;
}

function placeOf(city: CityConfig): Place {
  const details: CityDetails = Object.hasOwn(CITY_DETAILS, city.id)
    ? CITY_DETAILS[city.id]!
    : { districts: [], phonePrefix: '0000', roads: ['Testautobahn', 'Teststraße'], pollenRegion: city.name, gauges: {}, deprivationCentres: [] };
  const { districts } = details;
  return { city, districts, anchors: districts.length > 0 ? districts : spreadPoints(city), details };
}

/** The Bezirke the generator places things in for `cityId`, or none. */
export function syntheticDistricts(cityId: string): ReadonlyArray<Point & { name: string }> {
  return Object.hasOwn(CITY_DETAILS, cityId) ? CITY_DETAILS[cityId]!.districts : [];
}

/**
 * The political levels production fills for a city (cron/ingest-political.ts):
 * Bundestag and state parliament for every city in PARLIAMENT_CONFIG, Bezirk
 * mayors and the Oberbürgermeister where their hand-kept tables have the city,
 * state members by Bezirk where STATE_CONSTITUENCY_BEZIRKE has it.
 */
function politicalLevels(city: CityConfig): readonly PoliticalLevel[] {
  if (!hasParliamentConfig(city)) return [];
  const levels: PoliticalLevel[] = [];
  if (hasDistrictMayors(city)) levels.push('bezirke');
  if (hasMayor(city)) levels.push('mayor');
  levels.push('bundestag', 'state');
  if (groupsStateMembersByBezirk(city)) levels.push('state-bezirke');
  return levels;
}

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

function nearestDistrict(p: Point, districts: readonly Point[]): number {
  let best = 0;
  let bestDist = Infinity;
  districts.forEach((d, i) => {
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

/** {city} becomes the city's name. */
const NEWS_SOURCES = [
  { name: 'Synthetischer Kurier', slug: 'kurier', tier: 1 },
  { name: 'Testblatt {city}', slug: 'testblatt', tier: 2 },
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

function generateNews(rng: Rng, now: Date, place: Place): PersistedNewsItem[] {
  const categories = Object.keys(NEWS_TEMPLATES);
  const sources = NEWS_SOURCES.map((s) => ({ ...s, name: s.name.replace('{city}', place.city.name) }));
  return Array.from({ length: 30 }, (_, i): PersistedNewsItem => {
    const category = categories[i % categories.length]!;
    const district = rng.pick(place.anchors);
    const source = rng.pick(sources);
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

function generateSummary(news: PersistedNewsItem[], now: Date, seed: number, city: CityConfig): SyntheticData['summary'] {
  const briefingItems = news.filter((n) => n.assessment?.relevant_to_city && (n.assessment.importance ?? 0) >= 0.5);
  return {
    briefings: Object.fromEntries(city.languages.map((lang) => [lang, BRIEFINGS[lang] ?? BRIEFINGS.en!])),
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

function generateEvents(rng: Rng, now: Date, place: Place): CityEvent[] {
  const { date: today, hour: nowHour } = local(now);
  // Only the sources the city has: a kind from another one comes from its first
  const configured = (place.city.dataSources.events ?? []).map((e) => e.source);
  const events = Array.from({ length: 30 }, (_, i): CityEvent => {
    const template = EVENT_KINDS[i % EVENT_KINDS.length]!;
    const kind = configured.includes(template.source) || configured.length === 0
      ? template
      : { ...template, source: configured[0]! };
    const hour = rng.int(10, 21);
    // Over the next two weeks, always ahead of now
    const day = rng.int(0, 13) || (hour > nowHour ? 0 : 1);
    const district = rng.pick(place.anchors);
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

/**
 * The name the police feed's district list (police.districts in the city
 * config) knows a Bezirk by: the whole name ("Hamburg-Mitte") or its first
 * part ("Treptow" for Treptow-Köpenick). None when the list has neither.
 */
function policeArea(city: CityConfig, name: string): string | undefined {
  const known = city.dataSources.police?.districts ?? [];
  if (known.includes(name)) return name;
  const first = name.split('-')[0]!;
  return known.includes(first) ? first : undefined;
}

function generateSafety(rng: Rng, now: Date, place: Place): SafetyReport[] {
  return Array.from({ length: 15 }, (_, i): SafetyReport => {
    const district = rng.pick(place.anchors);
    const area = policeArea(place.city, district.name);
    const where = area ?? place.city.name;
    const title = `${MARK} ${rng.pick(SAFETY_KINDS)} in ${where}`;
    const url = `${EXAMPLE}/police/${i + 1}`;
    return {
      id: hashString(url + title),
      title,
      description: 'Erfundene Polizeimeldung für die lokale Entwicklung. Der Vorfall hat nicht stattgefunden.',
      publishedAt: new Date(now.getTime() - (i * 2 + rng.float(0, 2)) * HOUR).toISOString(),
      url,
      district: area,
      location: rng.chance(0.75) ? { ...near(rng, district), label: where } : undefined,
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

function generateWeather(rng: Rng, model: WeatherModel, now: Date, place: Place): WeatherData {
  const { coordinates } = place.city;
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
    const sun = SunCalc.getTimes(new Date(`${date}T12:00:00Z`), coordinates.lat, coordinates.lon);
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
  const current = currentWeather(rng, model, now);
  // DWD warnings and UV come for German cities only (cron/ingest-weather.ts)
  if (place.city.country !== 'DE') return { current, hourly, daily, alerts: [] };
  return {
    current,
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
function airQualityStations(rng: Rng, place: Place): AqStation[] {
  const { anchors } = place;
  return [...anchors, anchors[0]!, anchors[1]!].map((d, i) => ({
    ...near(rng, d, 0.02),
    station: `Synthetische Messstelle ${d.name}${i >= anchors.length ? ' 2' : ''}`,
    base: (i < 2 || i >= anchors.length ? 38 : 28) + rng.float(-5, 5),
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

/**
 * VBB alerts carry the station they were reported at; Geofox announcements
 * (Hamburg) have no configured stations, so theirs carry none, and no map point.
 */
function generateTransit(rng: Rng, city: CityConfig): TransitAlert[] {
  const transit = city.dataSources.transit;
  const stations = (transit?.provider === 'hafas' ? transit.stations ?? [] : []).map((s) => s.name);
  return TRANSIT_SCENARIOS.map((s, i) => {
    const message = `${MARK} ${s.message}`;
    if (stations.length === 0) {
      return {
        id: hashString(`${message}:`),
        line: s.lines.join(', '),
        lines: [...s.lines],
        type: s.type,
        severity: s.severity,
        message,
        detail: `${message}. Synthetische Meldung für die lokale Entwicklung; der Verkehr läuft normal.`,
        station: '',
        location: null,
        affectedStops: [],
      };
    }
    const station = stations[(i * 2) % stations.length]!;
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

function generateNina(now: Date, place: Place): NinaWarning[] {
  const centre = place.anchors[0]!;
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

/** Rough gauge positions and mean levels (cm) for Berlin's configured PEGELONLINE stations. */
const GAUGE_SITES: Record<string, Point & { mw: number }> = {
  'Mühlendamm': { lat: 52.5136, lon: 13.4083, mw: 310 },
  Charlottenburg: { lat: 52.5235, lon: 13.2985, mw: 230 },
  'Köpenick': { lat: 52.4447, lon: 13.5757, mw: 190 },
  Spandau: { lat: 52.5357, lon: 13.2063, mw: 255 },
  'Schmöckwitz': { lat: 52.3753, lon: 13.6476, mw: 180 },
};

/** The same for Hamburg's tidal Elbe gauges; the mean levels are made up. */
const HAMBURG_GAUGE_SITES: Record<string, Point & { mw: number }> = {
  'St. Pauli': { lat: 53.5455, lon: 9.9700, mw: 620 },
  Bunthaus: { lat: 53.4615, lon: 10.0650, mw: 640 },
  'Seemannshöft': { lat: 53.5405, lon: 9.8790, mw: 600 },
};

interface Gauge { uuid: string; name: string; waterBody: string; tidal: boolean; site: Point & { mw: number }; offset: number; phase: number }

function waterGauges(rng: Rng, place: Place): Gauge[] {
  const stations = place.city.dataSources.waterLevels?.stations ?? [];
  const { gauges } = place.details;
  // A gauge with no known site sits by the first place, the next ones a little further north
  const site = (name: string, i: number) => (Object.hasOwn(gauges, name)
    ? gauges[name]!
    : { lat: round(place.anchors[0]!.lat + 0.01 * i, 5), lon: place.anchors[0]!.lon, mw: 250 });
  return stations.map((s, i) => ({
    uuid: s.uuid,
    name: s.name,
    waterBody: s.waterBody,
    tidal: s.tidal ?? false,
    site: site(s.name, i),
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

function generateAppointments(rng: Rng, now: Date, city: CityConfig): BuergeramtData {
  const today = local(now).date;
  return {
    services: (city.dataSources.appointments?.services ?? []).map((s) => {
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

function generateBudget(rng: Rng, now: Date, place: Place): BudgetSummary {
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
  place.districts.forEach((d, i) => {
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

function generateConstruction(rng: Rng, now: Date, place: Place): ConstructionSite[] {
  const { anchors } = place;
  const subtypes: ConstructionSite['subtype'][] = ['construction', 'construction', 'closure', 'disruption'];
  const descriptions: Record<ConstructionSite['subtype'], string> = {
    construction: 'Straßenbauarbeiten, Fahrbahn verengt',
    closure: 'Vollsperrung wegen Leitungsarbeiten',
    disruption: 'Fahrstreifen eingeschränkt',
  };
  return Array.from({ length: 12 }, (_, i): ConstructionSite => {
    const subtype = subtypes[i % subtypes.length]!;
    const start = near(rng, anchors[i % anchors.length]!);
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

function generateTraffic(rng: Rng, now: Date, place: Place): TrafficIncident[] {
  const { anchors, details } = place;
  return Array.from({ length: 10 }, (_, i): TrafficIncident => {
    const kind = TRAFFIC_KINDS[i % TRAFFIC_KINDS.length]!;
    const lasting = kind.type === 'closure' || kind.type === 'construction';
    return {
      id: `synthetic-traffic-${i + 1}`,
      type: kind.type,
      severity: rng.pick(TRAFFIC_SEVERITIES),
      description: `${MARK} ${kind.text}`,
      road: rng.pick(details.roads),
      from: rng.pick(STREETS),
      to: rng.pick(STREETS),
      delay: kind.type === 'jam' || kind.type === 'accident' ? rng.int(60, 1200) : null,
      length: rng.int(200, 4000),
      geometry: { type: 'LineString', coordinates: polyline(rng, near(rng, rng.pick(anchors)), rng.int(3, 5)) },
      startTime: new Date(now.getTime() - rng.int(1, 48) * HOUR).toISOString(),
      endTime: lasting ? new Date(now.getTime() + rng.int(1, 14) * DAY).toISOString() : null,
    };
  });
}

function generatePharmacies(rng: Rng, now: Date, place: Place): EmergencyPharmacy[] {
  const { city, details } = place;
  const inDistricts = place.districts.length > 0;
  const { date: today, hour } = local(now);
  // Emergency duty runs from 9:00 to 9:00 the next morning
  const dutyStart = hour < 9 ? shiftDate(today, -1) : today;
  return place.anchors.filter((_, i) => i % 3 !== 2).map((d, i) => ({
    id: `apo-${city.id}-${i}`,
    name: inDistricts ? `Test-Apotheke ${d.name}` : `Test-Apotheke ${i + 1}`,
    address: `${rng.pick(STREETS)} ${rng.int(1, 120)}, ${d.plz ? `${d.plz} ` : ''}${city.name}`,
    district: inDistricts ? d.name : undefined,
    phone: `${details.phonePrefix} 0000000${i}`,
    location: near(rng, d),
    // Offset-less local time, like the aponet adapter
    validFrom: `${dutyStart}T09:00:00`,
    validUntil: `${shiftDate(dutyStart, 1)}T09:00:00`,
  }));
}

function generateAeds(rng: Rng, place: Place): AedLocation[] {
  const { anchors } = place;
  const operators = ['Testverein e. V.', 'Beispiel-Bezirksamt', 'Demo-Verkehrsbetrieb', 'Platzhalter GmbH'];
  return Array.from({ length: 80 }, (_, i): AedLocation => {
    const indoor = rng.chance(0.6);
    return {
      id: `synthetic-aed-${i + 1}`,
      ...near(rng, anchors[i % anchors.length]!, 0.02),
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

/** Where Berlin's status index is worst; the indices fall off smoothly around these. */
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
function generateAreas(rng: Rng, now: Date, place: Place): { socialAtlas: SyntheticData['socialAtlas']; population: SyntheticData['population'] } {
  const { north, south, east, west } = place.city.boundingBox;
  const { anchors } = place;
  const { deprivationCentres } = place.details;
  const source = place.city.dataSources.socialAtlas;
  const metrics = new Set(source ? SOCIAL_ATLAS_METRICS[source.provider] : []);
  const withStatus = source !== undefined && SOCIAL_ATLAS_HAS_STATUS_INDEX[source.provider];
  const yearly = place.city.dataSources.population !== undefined && place.city.dataSources.population.provider !== 'afstat-ewr-xlsx';
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
      const bezId = pad(nearestDistrict(centre, anchors) + 1);
      const plrId = `${bezId}99${pad(index, 4)}`;
      const plrName = `Synthetisches Gebiet ${index}`;
      const deprivation = clamp(
        0.1 + deprivationCentres.reduce((sum, c) => sum + 0.6 * Math.exp(-squaredKm(centre, c) / 32), 0) + rng.float(-0.08, 0.08),
        0, 1,
      );
      const population = Math.round((800 + 11000 * Math.exp(-((r / 0.45) ** 2))) * cellKm2 * rng.float(0.85, 1.15));
      const statusIndex = deprivation < 0.25 ? 1 : deprivation < 0.45 ? 2 : deprivation < 0.65 ? 3 : 4;
      const singleParent = round(18 + 30 * deprivation + rng.float(-3, 3), 1);

      social.push({
        type: 'Feature',
        geometry,
        properties: {
          plrId,
          plrName,
          bezId,
          population,
          // Only the indicators and status index the city's source has
          statusIndex: withStatus ? statusIndex : null,
          statusLabel: withStatus ? STATUS_LABELS[statusIndex]! : null,
          unemployment: metrics.has('unemployment') ? round(2 + 14 * deprivation, 1) : null,
          singleParent: metrics.has('singleParent') ? singleParent : null,
          welfare: metrics.has('welfare') ? round(3 + 30 * deprivation, 1) : null,
          childPoverty: metrics.has('childPoverty') ? round(5 + 45 * deprivation, 1) : null,
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
        snapshotDate: populationSnapshotDate(now, yearly),
        changePeriod: yearly ? 'year' : 'half-year',
      },
    },
  };
}

/**
 * The latest snapshot that would be published by now: Berlin's half-year one
 * (30 June / 31 December, ~3 months on), or the yearly one (31 December, ~6 months on).
 */
function populationSnapshotDate(now: Date, yearly: boolean): string {
  const year = now.getUTCFullYear();
  if (yearly) {
    const cutoff = new Date(now.getTime() - 180 * DAY).toISOString().slice(0, 10);
    return [`${year - 1}-12-31`, `${year - 2}-12-31`].find((d) => d <= cutoff)!;
  }
  const cutoff = new Date(now.getTime() - 90 * DAY).toISOString().slice(0, 10);
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

/**
 * Berlin (`lageso`): LAGeSo's sample date, with SARS-CoV-2 from AMELAG dated
 * on its own. An AMELAG city: every pathogen from AMELAG, about 12 days old.
 */
function generateWastewater(rng: Rng, now: Date, source: NonNullable<CityConfig['dataSources']['wastewater']>): WastewaterSummary {
  const today = local(now).date;
  const lageso = source.provider === 'lageso';
  return {
    sampleDate: shiftDate(today, lageso ? -4 : -12),
    plantCount: lageso ? 3 : source.sites.length,
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
        ...(lageso && p.name === 'SARS-CoV-2' ? { sampleDate: shiftDate(today, -9) } : {}),
      };
    }),
  };
}

/**
 * Made-up weekly flu and RSV case counts for the Land, as the RKI publishes
 * them: the Meldewoche before last (data cut on Wednesday), incidence per
 * 100,000 for about 3.8 million people.
 */
function generateRespiratoryCases(rng: Rng, now: Date): RespiratoryCases {
  const lastWeek = new Date(now);
  lastWeek.setUTCDate(now.getUTCDate() - 10);
  const week = isoWeekLabel(lastWeek);
  return {
    week,
    weekStart: isoWeekMonday(week).toISOString().slice(0, 10),
    pathogens: (['Influenza', 'RSV'] as const).map((name) => {
      const peak = name === 'Influenza' ? 40 : 6;
      const phase = rng.float(0, 2 * Math.PI);
      const history = Array.from({ length: 12 }, (_, w) =>
        Math.round(peak * (0.5 + 0.5 * Math.sin(phase + w / 2)) * rng.float(0.7, 1.3)));
      const cases = history[11]!;
      const previousCases = history[10]!;
      return {
        name,
        cases,
        incidence: Math.round((cases / 38) * 100) / 100,
        previousCases,
        trend: computeTrend(cases, previousCases),
        history,
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

/**
 * Berlin's lakes, or for another city a made-up spot near each of its
 * anchors, without a Bezirk or water body, as Hamburg's WFS gives none.
 */
function bathingSites(place: Place): ReadonlyArray<Point & { place: string; district: string; waterBody: string }> {
  if (place.city.id === 'berlin') return BATHING_SITES;
  return place.anchors.slice(0, 6).map((a) => ({ place: a.name, district: '', waterBody: '', lat: a.lat, lon: a.lon }));
}

function generateBathing(rng: Rng, now: Date, place: Place): BathingSpot[] {
  const today = local(now).date;
  const monthDay = today.slice(5);
  // The same season as ingest-bathing: 15 May to 15 September
  const inSeason = monthDay >= '05-15' && monthDay <= '09-15';
  const year = Number(today.slice(0, 4));
  const lastSample = inSeason ? today : `${monthDay > '09-15' ? year : year - 1}-09-10`;
  return bathingSites(place).map((s, i): BathingSpot => {
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
      // Hamburg's EU class codes are not documented, so production leaves its class out
      classification: place.city.id === 'berlin' ? rng.pick(['ausgezeichnet', 'gut']) : null,
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

function generatePollen(rng: Rng, now: Date, place: Place): PollenForecast {
  const today = local(now).date;
  const month = Number(today.slice(5, 7));
  const level = (type: PollenType): PollenIntensity => (POLLEN_SEASONS[type].includes(month) ? rng.pick(ACTIVE_POLLEN) : '0');
  const pollen = Object.fromEntries((Object.keys(POLLEN_SEASONS) as PollenType[]).map((type): [PollenType, PollenTypeForecast] =>
    [type, { today: level(type), tomorrow: level(type), dayAfterTomorrow: level(type) }])) as Record<PollenType, PollenTypeForecast>;
  return { region: place.details.pollenRegion, updatedAt: `${today} 11:00 Uhr`, pollen };
}

/**
 * The configured LHP gauges, mostly without flood; now and then the upstream
 * gauge at Meldestufe 1 with a made-up pre-warning for the city.
 */
function generateFloodStatus(rng: Rng, now: Date, city: CityConfig): FloodStatus {
  const stations = city.dataSources.floodStatus?.stations ?? [];
  const rising = rng.chance(0.3);
  const measured = new Date(Math.floor(now.getTime() / (15 * 60_000)) * 15 * 60_000);
  const measuredAt = `${localIso(measured)}:00${berlinUtcOffset(`${local(measured).date} 12:00:00`)}`;
  return {
    gauges: stations.map((s) => {
      const floodClass: FloodClass = rising && s.upstream ? 1 : 0;
      return {
        id: s.id,
        name: s.name,
        waterBody: s.waterBody,
        upstream: s.upstream ?? false,
        floodClass,
        stateLabel: floodClass === 0 ? 'Keine Meldestufe' : `Meldestufe ${floodClass}`,
        measuredAt,
        url: `${EXAMPLE}/pegel/${s.id}`,
      };
    }),
    alerts: rising
      ? [{
          id: 'SYN_1',
          headline: `${MARK} Vorwarnung: steigende Wasserstände`,
          area: city.name,
          level: 2,
          levelName: 'Vorwarnung',
          url: `${EXAMPLE}/hochwasser`,
        }]
      : [],
    updated: new Date(now.getTime() - 60_000).toISOString(),
  };
}

/** A few lifts and more escalators out of service at made-up stations near the city's anchors. */
function generateLiftOutages(rng: Rng, now: Date, place: Place): LiftOutageData {
  const outages: LiftOutage[] = [];
  const stations = place.anchors.slice(0, 8);
  stations.forEach((a, i) => {
    const station = `Haltestelle ${a.name} (synthetisch)`;
    const at = near(rng, a, 0.004);
    const nr = String(i + 1).padStart(3, '0');
    if (i < 3) outages.push({ id: `${nr}-01`, kind: 'lift', station, unit: 'Aufzug 01', ...at, info: null });
    const escalators = rng.int(0, 2);
    for (let k = 1; k <= escalators; k++) {
      outages.push({ id: `${nr}-5${k}`, kind: 'escalator', station, unit: `Fahrtreppe 5${k}`, ...at, info: null });
    }
  });
  const updated = new Date(Math.floor(now.getTime() / (15 * 60_000)) * 15 * 60_000);
  return { outages, updated: `${localIso(updated)}:00${berlinUtcOffset(`${local(updated).date} 12:00:00`)}` };
}

/** Bike-sharing stations around the city's anchors, some empty; docks only where the real system has them. */
function generateBikeSharing(rng: Rng, now: Date, city: CityConfig, place: Place): BikeSharingData {
  const source = city.dataSources.bikeSharing!;
  const docked = source.provider === 'gbfs';
  const reportedAt = Math.floor(now.getTime() / 1000) - 60;
  const stations: BikeStation[] = [];
  place.anchors.forEach((a, i) => {
    for (let k = 1; k <= 4; k++) {
      const bikes = rng.int(0, 3) === 0 ? 0 : rng.int(1, 9);
      const capacity = 10;
      stations.push({
        id: `syn-${i + 1}-${k}`,
        name: `${MARK} ${a.name} ${k}`,
        ...near(rng, a, 0.01),
        bikes,
        docks: docked ? capacity - Math.min(bikes, capacity) : null,
        reportedAt,
      });
    }
  });
  return { system: source.system, operator: source.operator, stations, updated: new Date(reportedAt * 1000).toISOString() };
}

/**
 * A made-up generation mix for the control area 45 minutes ago, the hourly
 * renewable share of the day before it, and Germany's grid for today in German
 * time: a solar bump around noon drives the share, signal and CO₂.
 */
function generateElectricity(rng: Rng, now: Date, controlArea: ElectricityData['controlArea']): ElectricityData {
  const QH = 15 * 60_000;
  const at = new Date(Math.floor((now.getTime() - 45 * 60_000) / QH) * QH);
  const sun = (t: Date) => Math.max(0, Math.sin(((t.getUTCHours() + t.getUTCMinutes() / 60 - 5) / 14) * Math.PI));
  const wind = rng.float(0.2, 0.8);
  const shareAt = (t: Date) => clamp(20 + wind * 40 + sun(t) * 30, 5, 95);

  const solar = Math.round(sun(at) * rng.float(6000, 12_000));
  const windOnshore = Math.round(wind * rng.float(6000, 14_000));
  const mw = {
    windOnshore, solar,
    windOffshore: controlArea === 'Amprion' ? undefined : Math.round(wind * rng.float(500, 2500)),
    biomass: rng.int(900, 1600), hydro: rng.int(50, 600), otherRenewable: rng.int(10, 60),
    lignite: rng.int(1500, 5000), hardCoal: rng.int(200, 1500), gas: rng.int(1000, 4000),
    pumpedStorage: rng.int(0, 400), otherConventional: rng.int(300, 800),
  };
  const total = Object.values(mw).reduce<number>((s, v) => s + (v ?? 0), 0);
  const renewable = mw.windOnshore + mw.solar + (mw.windOffshore ?? 0) + mw.biomass + mw.hydro + mw.otherRenewable;

  const renewableHistory = Array.from({ length: 24 }, (_, i) => {
    const t = new Date(Math.floor(at.getTime() / 3600_000) * 3600_000 - (23 - i) * 3600_000);
    return { t: t.toISOString(), share: round(shareAt(t) + rng.float(-3, 3), 1) };
  });

  const dayStart = new Date(`${local(now).date}T00:00:00${berlinUtcOffset(`${local(now).date} 12:00:00`)}`);
  const grid = Array.from({ length: 96 }, (_, i): GridPoint => {
    const t = new Date(dayStart.getTime() + i * QH);
    const share = round(shareAt(t), 1);
    const signal: GridSignal = share >= 60 ? 2 : share >= 40 ? 1 : 0;
    const co2Forecast = Math.round(650 - share * 5.5);
    return {
      t: t.toISOString(), share, signal,
      co2: t.getTime() <= at.getTime() ? co2Forecast + rng.int(-15, 15) : null,
      co2Forecast,
    };
  });

  return {
    controlArea,
    mix: {
      at: at.toISOString(),
      mw: Object.fromEntries(Object.entries(mw).filter(([, v]) => v !== undefined)),
      renewableShare: round((renewable / total) * 100, 1),
    },
    renewableHistory,
    grid,
  };
}

/**
 * One made-up station per configured UBA code, near the city's anchors, the
 * last hour fully measured. Every third is a traffic station, with more NO₂.
 */
function generateAirQualityStations(rng: Rng, now: Date, place: Place): AirQualityStation[] {
  const codes = place.city.dataSources.airQuality?.ubaStations ?? [];
  const { anchors } = place;
  const measuredAt = new Date(Math.floor(now.getTime() / HOUR) * HOUR - HOUR).toISOString();
  return codes.map((code, i): AirQualityStation => {
    const anchor = anchors[i % anchors.length]!;
    const traffic = i % 3 === 2;
    const no2 = Math.round(rng.float(10, 30) + (traffic ? 20 : 0));
    const pm10 = Math.round(rng.float(8, 30));
    const pm25 = Math.round(pm10 * rng.float(0.5, 0.8));
    const o3 = traffic ? null : Math.round(rng.float(5, 60));
    // UBA's bands for the overall index, roughly: NO₂ and PM decide it here
    const index = (no2 > 100 || pm10 > 50 ? 3 : no2 > 40 || pm10 > 35 || pm25 > 20 ? 2 : no2 > 20 || pm10 > 20 || pm25 > 10 ? 1 : 0) as AirQualityStation['index'];
    return {
      code,
      name: `Synthetische Messstation ${anchor.name}${i >= anchors.length ? ' 2' : ''}`,
      ...near(rng, anchor, 0.01),
      setting: traffic ? 'traffic' : 'background',
      network: 'XX',
      measuredAt,
      index,
      no2, pm10, pm25, o3,
    };
  });
}

const REPORT_CATEGORIES = [
  'Wilder Müll', 'Leuchte ausgefallen', 'Ampel ausgefallen', 'Defekte Oberfläche', 'Spielplatz beschädigt',
  'Schrottfahrräder', 'Graffiti', 'Mülleimer überfüllt',
];

/** Two weeks of made-up citizen reports around the city's anchors, older ones mostly closed. */
function generateCitizenReports(rng: Rng, now: Date, place: Place): CitizenReportData {
  const reports: CitizenReport[] = [];
  for (let i = 0; i < 60; i++) {
    const at = new Date(now.getTime() - rng.float(0, REPORT_WINDOW_DAYS * DAY));
    const ageDays = (now.getTime() - at.getTime()) / DAY;
    const closed = rng.chance(Math.min(0.9, 0.2 + ageDays / 8));
    const statusLabel = closed ? 'Abgeschlossen' : rng.chance(0.4) ? 'In Bearbeitung' : 'Neu';
    const category = rng.pick(REPORT_CATEGORIES);
    const id = `${90_001 + i}-synth`;
    const p = near(rng, rng.pick(place.anchors), 0.01);
    reports.push({
      id,
      lat: round(p.lat, 4),
      lon: round(p.lon, 4),
      category,
      group: reportGroup(category),
      status: reportStatus(closed ? 'closed' : 'open', statusLabel),
      statusLabel,
      requestedAt: at.toISOString(),
      updatedAt: new Date(Math.min(now.getTime(), at.getTime() + rng.float(1, 48) * HOUR)).toISOString(),
      url: requestPageUrl(`${EXAMPLE}/meldung/{id}`, id, null),
    });
  }
  return buildCitizenReportData(reports);
}

/**
 * A last year's worth of accidents in miniature: a dozen around each anchor,
 * mostly slight, a few serious, one killed per city, with bicycles and
 * pedestrians among the participants (bits as in TrafficAccident).
 */
function generateTrafficAccidents(rng: Rng, now: Date, place: Place): TrafficAccidentData {
  const year = now.getUTCFullYear() - 1;
  const accidents: TrafficAccident[] = [];
  place.anchors.forEach((a) => {
    for (let k = 0; k < 12; k++) {
      const { lat, lon } = near(rng, a, 0.015);
      const roll = rng.int(0, 9);
      const participants = roll < 4 ? 1 | 2 : roll < 6 ? 2 | 4 : roll < 7 ? 1 : 2;
      const severity = accidents.length === 0 ? 1 : rng.int(0, 5) === 0 ? 2 : 3;
      const kind = participants & 4 ? 6 : rng.int(1, 5);
      accidents.push([lon, lat, severity, rng.int(1, 12), rng.int(1, 7), rng.int(6, 22), kind, rng.int(1, 7), participants]);
    }
  });
  return { year, accidents, published: `${year + 1}-07-07T07:47:16` };
}

/**
 * Two counting sites per anchor and mode, counting the hour that ended over an
 * hour ago, some above and some below their usual count, one without a usual
 * count.
 */
function generateTrafficCounts(rng: Rng, now: Date, city: CityConfig, place: Place): TrafficCountData {
  const hour = new Date(Math.floor(now.getTime() / HOUR) * HOUR - 2 * HOUR).toISOString();
  const sites: TrafficCountSite[] = [];
  for (const mode of city.dataSources.trafficCounts!.modes) {
    place.anchors.forEach((a, i) => {
      for (let k = 1; k <= 2; k++) {
        const site = `${mode === 'car' ? 9 : 8}${String(i * 2 + k).padStart(3, '0')}`;
        const typical = mode === 'car' ? rng.int(300, 2500) : rng.int(20, 400);
        sites.push({
          id: `${mode}-${site}`,
          mode,
          site,
          name: `${MARK} ${a.name} ${k}`,
          ...near(rng, a, 0.01),
          hour,
          count: Math.round(typical * rng.float(0.5, 1.6)),
          typical: i === 0 && k === 1 ? null : typical,
          counters: rng.int(2, 8),
        });
      }
    });
  }
  return { sites, updated: now.toISOString() };
}

/** Charging stations around the city's anchors: two normal ones each, and a fast or high-power one at every other anchor. */
function generateEvCharging(rng: Rng, place: Place): EvChargingRegister {
  const stations: RegisterStation[] = [];
  place.anchors.forEach((a, i) => {
    for (let k = 1; k <= 2; k++) {
      stations.push({
        id: `syn-ev-${i + 1}-${k}`, ...near(rng, a, 0.01), operator: `${MARK} Stadtwerke`, address: `${MARK} ${a.name} ${k}`,
        points: rng.int(1, 2) * 2, maxKw: k === 1 ? 22 : 11, fast: false, plugs: ['type2'],
      });
    }
    if (i % 2 === 0) {
      const hpc = rng.int(0, 1) === 1;
      stations.push({
        id: `syn-ev-${i + 1}-fast`, ...near(rng, a, 0.01), operator: `${MARK} Schnellladen`, address: `${MARK} ${a.name} Schnell`,
        points: rng.int(2, 8), maxKw: hpc ? 300 : 50, fast: true, plugs: hpc ? ['ccs'] : ['ccs', 'chademo', 'type2'],
      });
    }
  });
  return { edition: '2026-09-01', stations };
}

/**
 * One place per anchor for each kind of heat-relief list the city has: cool
 * places with hours, fountains with Berlin's May–October season (one out of
 * order), toilets with a fee and accessibility.
 */
function generateHeatRelief(rng: Rng, city: CityConfig, place: Place): HeatReliefData {
  const kinds = new Set((city.dataSources.heatRelief ?? []).map((s) => s.kind));
  const places: HeatReliefPlace[] = [];
  place.anchors.forEach((a, i) => {
    if (kinds.has('cool')) {
      places.push({ kind: 'cool', ...near(rng, a, 0.008), name: `${MARK} Kühler Raum ${a.name}`, address: `${STREETS[i % STREETS.length]} ${i + 1}`, hours: 'Mo - Fr: 10:00 - 18:00 Uhr', accessible: rng.int(0, 1) === 0 ? 'yes' : 'partly' });
    }
    if (kinds.has('fountain')) {
      places.push({ kind: 'fountain', ...near(rng, a, 0.008), name: `${MARK} Trinkbrunnen ${a.name}`, season: { from: 5, to: 10 }, ...(i === 0 ? { outOfOrder: true, note: 'zur Zeit außer Betrieb' } : {}) });
    }
    if (kinds.has('toilet')) {
      places.push({ kind: 'toilet', ...near(rng, a, 0.008), name: `${MARK} Toilette ${a.name}`, hours: '24h', fee: rng.int(0, 1) === 0 ? 0 : 0.5, accessible: rng.int(0, 1) === 0 ? 'yes' : 'no', changingTable: rng.int(0, 1) === 0 });
    }
  });
  return { places };
}

/**
 * 90 made-up days of soil moisture up to two days ago (the DWD's lag), drying
 * through the period with a few rain bumps, each station a little apart; and
 * for a city with Gieß den Kiez, made-up watering totals up to the end of last month.
 */
function generateSoilMoisture(rng: Rng, now: Date, city: CityConfig, place: Place): SoilMoistureData {
  const source = city.dataSources.soilMoisture!;
  const end = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`) - 2 * DAY;
  const start = rng.float(70, 95);
  const fall = rng.float(20, 50);
  const history = Array.from({ length: 90 }, (_, i) => {
    const sandy = clamp(start - (fall * i) / 89 + Math.sin(i / 6) * 4 + rng.float(-1, 1), 5, 105);
    return { date: new Date(end - (89 - i) * DAY).toISOString().slice(0, 10), sandy: round(sandy, 1), loamy: round(clamp(sandy + 8, 5, 120), 1) };
  });
  const last = history.at(-1)!;
  const stations = source.stations.map((s) => {
    const offset = rng.float(-6, 6);
    return { id: s.id, name: s.name, date: last.date, sandy: Math.round(last.sandy + offset), loamy: Math.round(last.loamy + offset) };
  });

  let watering: SoilMoistureData['watering'] = null;
  if (source.treeWatering) {
    const through = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    const year = through.getUTCFullYear();
    const litres = (n: number) => n * rng.int(15, 40);
    const recent = rng.int(80, 400);
    const season = recent + rng.int(2000, 4000);
    const first = rng.int(0, place.anchors.length - 1);
    const districts = [0, 1, 2].map((i) => place.anchors[(first + i) % place.anchors.length]!);
    watering = {
      dataThrough: through.toISOString().slice(0, 10),
      last30Days: { waterings: recent, litres: litres(recent), trees: Math.round(recent * 0.6) },
      season: { year, waterings: season, litres: litres(season), trees: Math.round(season * 0.4) },
      previousSeason: { year: year - 1, waterings: season + 900, litres: litres(season + 900), trees: Math.round(season * 0.45) },
      topDistricts: districts.map((d, i) => ({ district: d.name, litres: (3 - i) * rng.int(8000, 15_000) })),
    };
  }
  return { stations, history, watering };
}

/**
 * Yesterday's counts at two Telraam segments per anchor: daylight-only
 * sensors (8 hours), busy and quiet streets, most with a usual Monday-style
 * value to compare with, one without.
 */
function generateTelraamCounts(rng: Rng, now: Date, place: Place): TelraamCountsData {
  const date = local(new Date(now.getTime() - DAY)).date;
  const segments: TelraamSegmentCount[] = [];
  place.anchors.forEach((a, i) => {
    for (let k = 0; k < 2; k++) {
      const cars = rng.int(150, 6000);
      const bikes = rng.int(50, 2500);
      const pedestrians = rng.int(20, 1500);
      const heavy = Math.round(cars * rng.float(0.05, 0.2));
      const usual = (n: number) => Math.round(n * rng.float(0.8, 1.2));
      segments.push({
        id: 9_900_000_000 + i * 10 + k,
        ...near(rng, a, 0.01),
        street: `Teststraße ${i * 2 + k + 1}`,
        district: a.name,
        cars, bikes, pedestrians, heavy,
        hours: 8,
        usual: segments.length === 0 ? null : { cars: usual(cars), bikes: usual(bikes), pedestrians: usual(pedestrians), heavy: usual(heavy), days: 4 },
      });
    }
  });
  return { date, segments };
}

function generateNoiseSensors(rng: Rng, place: Place): NoiseSensor[] {
  const { anchors } = place;
  // Berlin's inner Bezirke, where most DNMS sensors are
  const inner = [0, 1, 2, 3, 6, 7, 10].filter((i) => i < anchors.length);
  return Array.from({ length: 15 }, (_, i): NoiseSensor => {
    const laeq = round(rng.float(48, 72), 1);
    return {
      id: 990_001 + i,
      ...near(rng, anchors[inner[i % inner.length]!]!, 0.02),
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

function generateCouncilMeetings(rng: Rng, now: Date, place: Place): CouncilMeeting[] {
  const { city } = place;
  const today = local(now).date;
  const agenda = [
    { number: 'Ö 1', name: `${MARK} Eröffnung und Tagesordnung`, public: true },
    { number: 'Ö 2', name: `${MARK} Bericht des Bezirksamts`, public: true },
    { number: 'NÖ 1', name: `${MARK} Nichtöffentliche Testvorlage`, public: false },
  ];
  // OParl/PARDOK give local times with their UTC offset
  const at = (date: string, hour: number) => `${date}T${pad(hour)}:00:00${berlinUtcOffset(`${date}T${pad(hour)}:00:00`)}`;
  // Berlin names one OParl server per district; Köln and München file a meeting
  // under a district by its name, so the anchors stand in for theirs
  const cfg = city.dataSources.councilMeetings;
  // Hamburg's source lists the Bürgerschaft only, no district bodies
  const hasDistrictSource = Boolean(cfg?.bvv || cfg?.oparlBody || cfg?.muenchenRis);
  const districtNames = cfg?.bvv
    ? cfg.bvv.map((b) => b.district)
    : hasDistrictSource ? place.anchors.slice(0, 4).map((a) => a.name) : [];
  const bvv = districtNames.map((district, i): CouncilMeeting => {
    const date = shiftDate(today, 1 + ((i * 3) % 13));
    const hour = rng.int(16, 18);
    return {
      id: `synthetic-bvv-${i + 1}`,
      source: 'bvv',
      district,
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

/**
 * The levels production fills for the city (politicalLevels). A city-state's
 * are named by the Bezirk names the map's district boundaries carry; Bundestag
 * constituencies put the city in front ("Berlin-Mitte", "Hamburg-Altona"). A
 * city inside a state's are named by the constituencies PARLIAMENT_CONFIG
 * lists for it and the areas of its hand-kept tables.
 */
function generatePolitical(rng: Rng, place: Place): Partial<Record<PoliticalLevel, PoliticalDistrict[]>> {
  const { districts, city } = place;
  const levels = new Set(politicalLevels(city));
  const config = PARLIAMENT_CONFIG[city.id]!;
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

  const political: Partial<Record<PoliticalLevel, PoliticalDistrict[]>> = {};
  if (levels.has('bezirke')) {
    const areas = districts.length > 0 ? districts.map((d) => d.name) : handKeptAreas('bezirke', city.id);
    political.bezirke = areas.map((name): PoliticalDistrict => ({
      id: `bm-${slug(name)}`,
      name,
      level: 'bezirk',
      representatives: [person(rng.pick(PARTIES.slice(0, 4)), 'Bezirksbürgermeister:in')],
    }));
  }
  if (levels.has('mayor')) {
    political.mayor = handKeptAreas('mayor', city.id).map((name): PoliticalDistrict => ({
      id: `ob-${slug(name)}`,
      name,
      level: 'stadt',
      representatives: [person(rng.pick(PARTIES.slice(0, 4)), 'Oberbürgermeister:in')],
    }));
  }
  if (levels.has('bundestag')) {
    const names = config.constituencies?.bundestag
      ?? districts.map((d) => (d.name.startsWith(`${city.name}-`) ? d.name : `${city.name}-${d.name}`));
    political.bundestag = names.map((name): PoliticalDistrict => (
      { id: `bundestag-${slug(name)}`, name, level: 'bundestag', representatives: [person(rng.pick(PARTIES), 'MdB', name)] }
    ));
  }
  if (!levels.has('state') && !levels.has('state-bezirke')) return political;
  const role = config.state.role;
  // A city inside a state: one member per constituency of the city and one list member
  // who stood there; a city-state: two numbered constituencies per Bezirk.
  const stateReps = config.constituencies
    ? config.constituencies.state.map((c) => [person(rng.pick(PARTIES), role, c), person(rng.pick(PARTIES), role, c)])
    : districts.map((d) => [1, 2].map((n) => person(rng.pick(PARTIES), role, `${d.name} ${n}`)));
  if (config.constituencies && levels.has('state')) {
    political.state = config.constituencies.state.map((name, i): PoliticalDistrict => ({
      id: `state-${slug(name)}`,
      name,
      level: 'landesparlament',
      representatives: stateReps[i]!,
    }));
  } else if (levels.has('state')) {
    political.state = stateReps.flat().map((rep): PoliticalDistrict => ({
      id: `state-${slug(rep.constituency!)}`,
      name: rep.constituency!,
      level: 'landesparlament',
      representatives: [rep],
    }));
  }
  if (levels.has('state-bezirke')) {
    political['state-bezirke'] = districts.map((d, i): PoliticalDistrict => ({
      id: `state-bezirk-${slug(d.name)}`,
      name: d.name,
      level: 'landesparlament',
      representatives: stateReps[i]!,
    }));
  }
  return political;
}

// ---------------------------------------------------------------------------
// Per-city details (after every constant they name)
// ---------------------------------------------------------------------------

const CITY_DETAILS: Readonly<Record<string, CityDetails>> = {
  berlin: {
    districts: DISTRICTS,
    phonePrefix: '030',
    roads: ['A100', 'A111', 'A113', 'B1', 'B2', 'B96', 'B101'],
    pollenRegion: 'Brandenburg und Berlin',
    gauges: GAUGE_SITES,
    deprivationCentres: DEPRIVATION_CENTRES,
  },
  hamburg: {
    districts: HAMBURG_DISTRICTS,
    phonePrefix: '040',
    roads: ['A1', 'A7', 'A24', 'A255', 'B4', 'B5', 'B75'],
    pollenRegion: 'Geest, Schleswig-Holstein und Hamburg',
    gauges: HAMBURG_GAUGE_SITES,
    // Made-up hot spots for the synthetic indices
    deprivationCentres: [{ lat: 53.54, lon: 10.11 }, { lat: 53.5, lon: 10.0 }, { lat: 53.61, lon: 10.06 }],
  },
  koeln: {
    districts: KOELN_DISTRICTS,
    phonePrefix: '0221',
    roads: ['A1', 'A3', 'A4', 'A57', 'A59', 'B9', 'B55'],
    pollenRegion: 'Rhein.-Westfäl. Tiefland',
    gauges: { 'Köln': { lat: 50.9369, lon: 6.9628, mw: 300 } },
    // Made-up hot spots for the synthetic indices
    deprivationCentres: [{ lat: 51.03, lon: 6.9 }, { lat: 50.94, lon: 7.01 }, { lat: 50.86, lon: 7.06 }],
  },
  muenchen: {
    districts: MUENCHEN_DISTRICTS,
    phonePrefix: '089',
    roads: ['A8', 'A9', 'A94', 'A95', 'A96', 'A99', 'B2R'],
    pollenRegion: 'Allgäu/Oberbayern/Bay. Wald',
    gauges: {},
    // Made-up hot spots for the synthetic indices
    deprivationCentres: [{ lat: 48.215, lon: 11.54 }, { lat: 48.1, lon: 11.65 }, { lat: 48.19, lon: 11.57 }],
  },
};
