const BASE = '/api';

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
  PopulationFeatureProps, PopulationSummary, FeuerwehrSummary,
  FeuerwehrMonthData, PollenForecast, PollenType, PollenIntensity,
  PollenTypeForecast, NoiseSensor, CouncilMeeting, NinaWarning,
  TrafficIncident, EmergencyPharmacy, Representative, PoliticalDistrict,
  TransitAlert, AirQuality, BootstrapData, NewsSummaryData,
} from '@city-monitor/shared';

// Import types used locally in api object definitions
import type {
  WeatherData, ApiResponse, HistoryPoint, NewsDigest,
  CityEvent, SafetyReport, AirQualityGridPoint, ConstructionSite,
  WaterLevelData, AedLocation, BathingSpot, BudgetSummary,
  BuergeramtData, LaborMarketSummary, WastewaterSummary,
  PopulationSummary, FeuerwehrSummary, PollenForecast, NoiseSensor,
  CouncilMeeting, NinaWarning, TrafficIncident, EmergencyPharmacy,
  PoliticalDistrict, TransitAlert, AirQuality, BootstrapData,
  NewsSummaryData,
} from '@city-monitor/shared';

export const api = {
  getBootstrap: (city: string) => fetchJson<BootstrapData>(`${BASE}/${city}/bootstrap`),
  getNewsDigest: (city: string) => fetchJson<ApiResponse<NewsDigest>>(`${BASE}/${city}/news/digest`),
  getNewsSummary: (city: string, lang?: string) => fetchJson<ApiResponse<NewsSummaryData>>(`${BASE}/${city}/news/summary${lang ? `?lang=${lang}` : ''}`),
  getWeather: (city: string) => fetchJson<ApiResponse<WeatherData>>(`${BASE}/${city}/weather`),
  getTransit: (city: string) => fetchJson<ApiResponse<TransitAlert[]>>(`${BASE}/${city}/transit`),
  getEvents: (city: string) => fetchJson<ApiResponse<CityEvent[]>>(`${BASE}/${city}/events`),
  getSafety: (city: string) => fetchJson<ApiResponse<SafetyReport[]>>(`${BASE}/${city}/safety`),
  getNina: (city: string) => fetchJson<ApiResponse<NinaWarning[]>>(`${BASE}/${city}/nina`),
  getAirQuality: (city: string) => fetchJson<ApiResponse<AirQuality | null>>(`${BASE}/${city}/air-quality`),
  getAirQualityGrid: (city: string) => fetchJson<ApiResponse<AirQualityGridPoint[]>>(`${BASE}/${city}/air-quality/grid`),
  getPharmacies: (city: string) => fetchJson<ApiResponse<EmergencyPharmacy[]>>(`${BASE}/${city}/pharmacies`),
  getTraffic: (city: string) => fetchJson<ApiResponse<TrafficIncident[]>>(`${BASE}/${city}/traffic`),
  getConstruction: (city: string) => fetchJson<ApiResponse<ConstructionSite[]>>(`${BASE}/${city}/construction`),
  getAeds: (city: string) => fetchJson<ApiResponse<AedLocation[]>>(`${BASE}/${city}/aeds`),
  getBathing: (city: string) => fetchJson<ApiResponse<BathingSpot[]>>(`${BASE}/${city}/bathing`),
  getWaterLevels: (city: string) => fetchJson<ApiResponse<WaterLevelData>>(`${BASE}/${city}/water-levels`),
  getPolitical: (city: string, level: 'bundestag' | 'state' | 'bezirke' | 'state-bezirke') => fetchJson<ApiResponse<PoliticalDistrict[]>>(`${BASE}/${city}/political/${level}`),
  getBudget: (city: string) => fetchJson<ApiResponse<BudgetSummary | null>>(`${BASE}/${city}/budget`),
  getAppointments: (city: string) => fetchJson<ApiResponse<BuergeramtData>>(`${BASE}/${city}/appointments`),
  getSocialAtlas: (city: string) => fetchJson<ApiResponse<GeoJSON.FeatureCollection | null>>(`${BASE}/${city}/social-atlas`),
  getLaborMarket: (city: string) => fetchJson<ApiResponse<LaborMarketSummary | null>>(`${BASE}/${city}/labor-market`),
  getWastewater: (city: string) => fetchJson<ApiResponse<WastewaterSummary | null>>(`${BASE}/${city}/wastewater`),
  getPopulation: (city: string) => fetchJson<ApiResponse<GeoJSON.FeatureCollection | null>>(`${BASE}/${city}/population`),
  getPopulationSummary: (city: string) => fetchJson<ApiResponse<PopulationSummary | null>>(`${BASE}/${city}/population/summary`),
  getFeuerwehr: (city: string) => fetchJson<ApiResponse<FeuerwehrSummary | null>>(`${BASE}/${city}/feuerwehr`),
  getPollen: (city: string) => fetchJson<ApiResponse<PollenForecast | null>>(`${BASE}/${city}/pollen`),
  getNoiseSensors: (city: string) => fetchJson<ApiResponse<NoiseSensor[] | null>>(`${BASE}/${city}/noise-sensors`),
  getCouncilMeetings: (city: string) => fetchJson<ApiResponse<CouncilMeeting[] | null>>(`${BASE}/${city}/council-meetings`),
  // History endpoints — lazy-loaded for expanded tile views
  getWeatherHistory: (city: string, range = '7d') => fetchJson<{ data: HistoryPoint[] }>(`${BASE}/${city}/weather/history?range=${range}`),
  getWaterLevelHistory: (city: string, range = '7d') => fetchJson<{ data: HistoryPoint[] }>(`${BASE}/${city}/water-levels/history?range=${range}`),
  getLaborMarketHistory: (city: string, range = '365d') => fetchJson<{ data: HistoryPoint[] }>(`${BASE}/${city}/labor-market/history?range=${range}`),
};
