import { resolveApiBase } from './api-base.js';

/** Every API request starts here: '/api', or VITE_API_BASE in a production build (lib/api-base.ts). */
export const API_BASE = resolveApiBase(import.meta.env.VITE_API_BASE);

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// Re-export all shared types for backward compatibility
export type {
  WeatherData, ApiResponse, HistoryPoint, NewsItem, NewsDigest,
  CityEvent, SafetyReport, AirQualityGridPoint, ConstructionSite,
  WaterLevelData, WaterLevelStation, AedLocation, BathingSpot,
  BudgetSummary, BudgetAreaSummary, BudgetCategoryAmount,
  BuergeramtData, BuergeramtService, SocialAtlasFeatureProps,
  LaborMarketSummary, WastewaterSummary, WastewaterPathogen,
  RespiratoryCases, RespiratoryCaseSeries,
  PopulationFeatureProps, PopulationSummary, FeuerwehrSummary,
  FeuerwehrMonthData, PollenForecast, PollenType, PollenIntensity,
  PollenTypeForecast, NoiseSensor, CouncilMeeting, NinaWarning,
  TrafficIncident, EmergencyPharmacy, Representative, PoliticalDistrict,
  TransitAlert, AirQuality, BootstrapData, NewsSummaryData,
  FloodStatus, FloodGauge, FloodAlert, FloodClass, LiftOutage, LiftOutageData,
  BikeStation, BikeSharingData,
  ElectricityData, ElectricityMix, GenerationKind, GridPoint, GridSignal, ControlArea,
  AirQualityStation, UbaAirIndex,
  CitizenReport, CitizenReportData, CitizenReportGroup, CitizenReportStatus,
  TrafficAccident, TrafficAccidentData, AccidentSeverity,
} from '@city-monitor/shared';

// Import types used locally in api object definitions
import type {
  WeatherData, ApiResponse, HistoryPoint, NewsDigest,
  CityEvent, SafetyReport, AirQualityGridPoint, ConstructionSite,
  WaterLevelData, AedLocation, BathingSpot, BudgetSummary,
  BuergeramtData, LaborMarketSummary, WastewaterSummary, RespiratoryCases,
  PopulationSummary, FeuerwehrSummary, PollenForecast, NoiseSensor,
  CouncilMeeting, NinaWarning, TrafficIncident, EmergencyPharmacy,
  PoliticalDistrict, TransitAlert, AirQuality, BootstrapData,
  NewsSummaryData, FloodStatus, LiftOutageData, CitizenReportData, AirQualityStation, BikeSharingData, TrafficAccidentData, ElectricityData,
} from '@city-monitor/shared';

/** The levels `GET /api/:city/political/:level` serves (packages/server/src/routes/political.ts). */
export type PoliticalLevel = 'bundestag' | 'state' | 'bezirke' | 'mayor' | 'state-bezirke';

export const api = {
  getBootstrap: (city: string) => fetchJson<BootstrapData>(`${API_BASE}/${city}/bootstrap`),
  getNewsDigest: (city: string) => fetchJson<ApiResponse<NewsDigest>>(`${API_BASE}/${city}/news/digest`),
  getNewsSummary: (city: string, lang?: string) => fetchJson<ApiResponse<NewsSummaryData>>(`${API_BASE}/${city}/news/summary${lang ? `?lang=${lang}` : ''}`),
  getWeather: (city: string) => fetchJson<ApiResponse<WeatherData>>(`${API_BASE}/${city}/weather`),
  getTransit: (city: string) => fetchJson<ApiResponse<TransitAlert[]>>(`${API_BASE}/${city}/transit`),
  getEvents: (city: string) => fetchJson<ApiResponse<CityEvent[]>>(`${API_BASE}/${city}/events`),
  getSafety: (city: string) => fetchJson<ApiResponse<SafetyReport[]>>(`${API_BASE}/${city}/safety`),
  getNina: (city: string) => fetchJson<ApiResponse<NinaWarning[]>>(`${API_BASE}/${city}/nina`),
  getAirQuality: (city: string) => fetchJson<ApiResponse<AirQuality | null>>(`${API_BASE}/${city}/air-quality`),
  getAirQualityGrid: (city: string) => fetchJson<ApiResponse<AirQualityGridPoint[]>>(`${API_BASE}/${city}/air-quality/grid`),
  getAirQualityStations: (city: string) => fetchJson<ApiResponse<AirQualityStation[] | null>>(`${API_BASE}/${city}/air-quality/stations`),
  getPharmacies: (city: string) => fetchJson<ApiResponse<EmergencyPharmacy[]>>(`${API_BASE}/${city}/pharmacies`),
  getTraffic: (city: string) => fetchJson<ApiResponse<TrafficIncident[]>>(`${API_BASE}/${city}/traffic`),
  getConstruction: (city: string) => fetchJson<ApiResponse<ConstructionSite[]>>(`${API_BASE}/${city}/construction`),
  getAeds: (city: string) => fetchJson<ApiResponse<AedLocation[]>>(`${API_BASE}/${city}/aeds`),
  getBathing: (city: string) => fetchJson<ApiResponse<BathingSpot[]>>(`${API_BASE}/${city}/bathing`),
  getWaterLevels: (city: string) => fetchJson<ApiResponse<WaterLevelData>>(`${API_BASE}/${city}/water-levels`),
  getFloodStatus: (city: string) => fetchJson<ApiResponse<FloodStatus | null>>(`${API_BASE}/${city}/flood-status`),
  getLiftOutages: (city: string) => fetchJson<ApiResponse<LiftOutageData | null>>(`${API_BASE}/${city}/lift-outages`),
  getBikeSharing: (city: string) => fetchJson<ApiResponse<BikeSharingData | null>>(`${API_BASE}/${city}/bike-sharing`),
  getElectricity: (city: string) => fetchJson<ApiResponse<ElectricityData | null>>(`${API_BASE}/${city}/electricity`),
  getCitizenReports: (city: string) => fetchJson<ApiResponse<CitizenReportData | null>>(`${API_BASE}/${city}/citizen-reports`),
  getTrafficAccidents: (city: string) => fetchJson<ApiResponse<TrafficAccidentData | null>>(`${API_BASE}/${city}/traffic-accidents`),
  getPolitical: (city: string, level: PoliticalLevel) => fetchJson<ApiResponse<PoliticalDistrict[]>>(`${API_BASE}/${city}/political/${level}`),
  getBudget: (city: string) => fetchJson<ApiResponse<BudgetSummary | null>>(`${API_BASE}/${city}/budget`),
  getAppointments: (city: string) => fetchJson<ApiResponse<BuergeramtData>>(`${API_BASE}/${city}/appointments`),
  getSocialAtlas: (city: string) => fetchJson<ApiResponse<GeoJSON.FeatureCollection | null>>(`${API_BASE}/${city}/social-atlas`),
  getLaborMarket: (city: string) => fetchJson<ApiResponse<LaborMarketSummary | null>>(`${API_BASE}/${city}/labor-market`),
  getWastewater: (city: string) => fetchJson<ApiResponse<WastewaterSummary | null>>(`${API_BASE}/${city}/wastewater`),
  getRespiratoryCases: (city: string) => fetchJson<ApiResponse<RespiratoryCases | null>>(`${API_BASE}/${city}/respiratory-cases`),
  getPopulation: (city: string) => fetchJson<ApiResponse<GeoJSON.FeatureCollection | null>>(`${API_BASE}/${city}/population`),
  getPopulationSummary: (city: string) => fetchJson<ApiResponse<PopulationSummary | null>>(`${API_BASE}/${city}/population/summary`),
  getFeuerwehr: (city: string) => fetchJson<ApiResponse<FeuerwehrSummary | null>>(`${API_BASE}/${city}/feuerwehr`),
  getPollen: (city: string) => fetchJson<ApiResponse<PollenForecast | null>>(`${API_BASE}/${city}/pollen`),
  getNoiseSensors: (city: string) => fetchJson<ApiResponse<NoiseSensor[] | null>>(`${API_BASE}/${city}/noise-sensors`),
  getCouncilMeetings: (city: string) => fetchJson<ApiResponse<CouncilMeeting[] | null>>(`${API_BASE}/${city}/council-meetings`),
  // History endpoints — lazy-loaded for expanded tile views
  getWeatherHistory: (city: string, range = '7d') => fetchJson<{ data: HistoryPoint[] }>(`${API_BASE}/${city}/weather/history?range=${range}`),
  getWaterLevelHistory: (city: string, range = '7d') => fetchJson<{ data: HistoryPoint[] }>(`${API_BASE}/${city}/water-levels/history?range=${range}`),
  getLaborMarketHistory: (city: string, range = '365d') => fetchJson<{ data: HistoryPoint[] }>(`${API_BASE}/${city}/labor-market/history?range=${range}`),
};
