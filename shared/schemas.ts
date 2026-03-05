/**
 * Zod schemas for JSONB data validation.
 * Used in DB read functions to validate data from Postgres JSONB columns
 * before casting to TypeScript types. On validation failure, functions
 * return null (treat as cache miss) rather than passing malformed data
 * to the frontend.
 */

import { z } from 'zod';

// --- Weather ---

export const CurrentWeatherSchema = z.object({
  temp: z.number(),
  feelsLike: z.number(),
  humidity: z.number(),
  precipitation: z.number(),
  weatherCode: z.number(),
  windSpeed: z.number(),
  windDirection: z.number(),
  uvIndex: z.number().optional(),
  uvIndexClearSky: z.number().optional(),
});

export const HourlyForecastSchema = z.object({
  time: z.string(),
  temp: z.number(),
  precipProb: z.number(),
  weatherCode: z.number(),
  uvIndex: z.number().optional(),
});

export const DailyForecastSchema = z.object({
  date: z.string(),
  high: z.number(),
  low: z.number(),
  weatherCode: z.number(),
  precip: z.number(),
  sunrise: z.string(),
  sunset: z.string(),
  uvIndexMax: z.number().optional(),
  uvIndexClearSkyMax: z.number().optional(),
});

export const WeatherAlertSchema = z.object({
  headline: z.string(),
  severity: z.string(),
  description: z.string(),
  validUntil: z.string(),
});

export const WeatherDataSchema = z.object({
  current: CurrentWeatherSchema,
  hourly: z.array(HourlyForecastSchema),
  daily: z.array(DailyForecastSchema),
  alerts: z.array(WeatherAlertSchema),
});

// --- Water Levels ---

export const WaterLevelStationSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  waterBody: z.string(),
  lat: z.number(),
  lon: z.number(),
  currentLevel: z.number(),
  timestamp: z.string(),
  state: z.enum(['low', 'normal', 'high', 'very_high', 'unknown']),
  tidal: z.boolean(),
  characteristicValues: z.array(z.object({
    shortname: z.string(),
    value: z.number(),
  })).optional(),
});

export const WaterLevelDataSchema = z.object({
  stations: z.array(WaterLevelStationSchema),
  fetchedAt: z.string(),
});

// --- Bürgeramt Appointments ---

export const BuergeramtServiceSchema = z.object({
  serviceId: z.string(),
  name: z.string(),
  earliestDate: z.string().nullable(),
  availableDays: z.number(),
  status: z.enum(['available', 'scarce', 'none', 'unknown']),
});

export const BuergeramtDataSchema = z.object({
  services: z.array(BuergeramtServiceSchema),
  fetchedAt: z.string(),
  bookingUrl: z.string(),
});

// --- Air Quality Grid ---

export const AirQualityGridPointSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  europeanAqi: z.number(),
  station: z.string(),
  url: z.string().optional(),
});

export const AirQualityGridSchema = z.array(AirQualityGridPointSchema);

// --- Budget ---

export const BudgetCategoryAmountSchema = z.object({
  code: z.number(),
  name: z.string(),
  amount: z.number(),
});

export const BudgetAreaSummarySchema = z.object({
  areaCode: z.number(),
  areaName: z.string(),
  revenues: z.array(BudgetCategoryAmountSchema),
  expenses: z.array(BudgetCategoryAmountSchema),
  totalRevenue: z.number(),
  totalExpense: z.number(),
});

export const BudgetSummarySchema = z.object({
  year: z.string(),
  areas: z.array(BudgetAreaSummarySchema),
  fetchedAt: z.string(),
});

// --- Construction Sites ---

export const ConstructionSiteSchema = z.object({
  id: z.string(),
  subtype: z.enum(['construction', 'closure', 'disruption']),
  street: z.string(),
  section: z.string().optional(),
  description: z.string(),
  direction: z.string().optional(),
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  isFuture: z.boolean().default(false),
  geometry: z.object({
    type: z.string(),
    coordinates: z.any(),
  }),
});

// --- Traffic Incidents ---

export const TrafficIncidentSchema = z.object({
  id: z.string(),
  type: z.enum(['jam', 'closure', 'construction', 'accident', 'other']),
  severity: z.enum(['low', 'moderate', 'major', 'critical']),
  description: z.string(),
  road: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  delay: z.number().optional(),
  length: z.number().optional(),
  geometry: z.object({ type: z.string(), coordinates: z.any() }),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

// --- Emergency Pharmacies ---

export const EmergencyPharmacySchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  district: z.string().optional(),
  phone: z.string().optional(),
  location: z.object({ lat: z.number(), lon: z.number() }),
  validFrom: z.string(),
  validUntil: z.string(),
  distance: z.number().optional(),
});

// --- AED Locations ---

export const AedLocationSchema = z.object({
  id: z.string(),
  lat: z.number(),
  lon: z.number(),
  indoor: z.boolean(),
  description: z.string().optional(),
  operator: z.string().optional(),
  openingHours: z.string().optional(),
  access: z.string().optional(),
});

// --- Bathing Spots ---

export const BathingSpotSchema = z.object({
  id: z.string(),
  name: z.string(),
  district: z.string(),
  waterBody: z.string(),
  lat: z.number(),
  lon: z.number(),
  measuredAt: z.string(),
  waterTemp: z.number().nullable(),
  visibility: z.number().nullable(),
  quality: z.enum(['good', 'warning', 'poor']),
  algae: z.string().nullable(),
  advisory: z.string().nullable(),
  classification: z.string().nullable(),
  detailUrl: z.string(),
  inSeason: z.boolean(),
});

// --- Wastewater ---

export const WastewaterPathogenSchema = z.object({
  name: z.string(),
  value: z.number(),
  previousValue: z.number(),
  trend: z.enum(['rising', 'falling', 'stable', 'new', 'gone']),
  level: z.enum(['none', 'low', 'moderate', 'high']),
  history: z.array(z.number()),
  sampleDate: z.string().optional(),
});

export const WastewaterSummarySchema = z.object({
  sampleDate: z.string(),
  pathogens: z.array(WastewaterPathogenSchema),
  plantCount: z.number(),
});

// --- Labor Market ---

export const LaborMarketSummarySchema = z.object({
  unemploymentRate: z.number(),
  totalUnemployed: z.number(),
  yoyChangeAbsolute: z.number(),
  yoyChangePercent: z.number(),
  sgbIIRate: z.number(),
  sgbIICount: z.number(),
  sgbIIYoyAbsolute: z.number(),
  sgbIIYoyPercent: z.number(),
  underemploymentRate: z.number(),
  underemploymentCount: z.number(),
  underemploymentYoyAbsolute: z.number(),
  underemploymentYoyPercent: z.number(),
  reportMonth: z.string(),
});

// --- Political Districts ---

export const RepresentativeSchema = z.object({
  name: z.string(),
  party: z.string(),
  role: z.string(),
  photoUrl: z.string().optional(),
  profileUrl: z.string().optional(),
  constituency: z.string().optional(),
});

export const PoliticalDistrictSchema = z.object({
  id: z.string(),
  name: z.string(),
  level: z.enum(['bezirk', 'bundestag', 'landesparlament']),
  representatives: z.array(RepresentativeSchema),
});

// --- Feuerwehr ---

export const FeuerwehrMonthDataSchema = z.object({
  reportMonth: z.string(),
  missionCountAll: z.number(),
  missionCountEms: z.number(),
  missionCountFire: z.number(),
  missionCountTechnicalRescue: z.number(),
  responseTimeEmsCriticalMedian: z.number(),
  responseTimeFirePumpMedian: z.number(),
});

export const FeuerwehrSummarySchema = z.object({
  current: FeuerwehrMonthDataSchema,
  partial: FeuerwehrMonthDataSchema.nullable(),
  previous: FeuerwehrMonthDataSchema.nullable(),
});

// --- Population Demographics ---

// --- Noise Sensors ---

export const NoiseSensorSchema = z.object({
  id: z.number(),
  lat: z.number(),
  lon: z.number(),
  laeq: z.number(),
  laMin: z.number(),
  laMax: z.number(),
});

// --- Pollen Forecast ---

const PollenIntensitySchema = z.enum(['0', '0-1', '1', '1-2', '2', '2-3', '3', '-1']);

const PollenTypeForecastSchema = z.object({
  today: PollenIntensitySchema,
  tomorrow: PollenIntensitySchema,
  dayAfterTomorrow: PollenIntensitySchema,
});

const POLLEN_TYPES = ['Hasel', 'Erle', 'Esche', 'Birke', 'Graeser', 'Roggen', 'Beifuss', 'Ambrosia'] as const;

export const PollenForecastSchema = z.object({
  region: z.string(),
  updatedAt: z.string(),
  pollen: z.object(
    Object.fromEntries(POLLEN_TYPES.map((t) => [t, PollenTypeForecastSchema])) as Record<typeof POLLEN_TYPES[number], typeof PollenTypeForecastSchema>,
  ),
});

// --- Population Demographics ---

export const PopulationSummarySchema = z.object({
  total: z.number(),
  density: z.number().default(0),
  foreignTotal: z.number(),
  foreignPct: z.number(),
  elderlyPct: z.number(),
  youthPct: z.number(),
  workingAgePct: z.number(),
  changeAbsolute: z.number(),
  changePct: z.number(),
  snapshotDate: z.string(),
});

// --- Council Meetings ---

export const CouncilAgendaItemSchema = z.object({
  number: z.string(),
  name: z.string(),
  public: z.boolean(),
});

export const CouncilMeetingSchema = z.object({
  id: z.string(),
  source: z.enum(['bvv', 'parliament']),
  district: z.string().optional(),
  committee: z.string(),
  start: z.string(),
  end: z.string().optional(),
  location: z.string().optional(),
  agendaItems: z.array(CouncilAgendaItemSchema).optional(),
  webUrl: z.string().optional(),
});

export type CouncilMeeting = z.infer<typeof CouncilMeetingSchema>;

// --- Transit Alerts ---

export const TransitAlertSchema = z.object({
  id: z.string(),
  line: z.string(),
  lines: z.array(z.string()),
  type: z.enum(['delay', 'disruption', 'cancellation', 'planned-work']),
  severity: z.enum(['low', 'medium', 'high']),
  message: z.string(),
  detail: z.string(),
  station: z.string(),
  location: z.object({ lat: z.number(), lon: z.number() }).nullable(),
  affectedStops: z.array(z.string()),
});

// --- NINA Warnings ---

export const NinaWarningSchema = z.object({
  id: z.string(),
  version: z.number(),
  startDate: z.string(),
  expiresAt: z.string().optional(),
  severity: z.enum(['minor', 'moderate', 'severe', 'extreme']),
  urgency: z.string().optional(),
  type: z.string(),
  source: z.enum(['mowas', 'biwapp', 'katwarn', 'dwd', 'lhp', 'police']),
  headline: z.string(),
  description: z.string().optional(),
  instruction: z.string().optional(),
  area: z.object({ type: z.string(), geometry: z.unknown(), properties: z.unknown().optional() }).optional(),
});
