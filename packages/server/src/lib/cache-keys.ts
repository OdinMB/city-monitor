/** Typed cache key helpers. Use these instead of raw string interpolation. */
export const CK = {
  // Weather & Air Quality
  weather: (cityId: string) => `${cityId}:weather`,
  airQuality: (cityId: string) => `${cityId}:air-quality`,
  airQualityGrid: (cityId: string) => `${cityId}:air-quality:grid`,
  airQualityScCache: (cityId: string) => `${cityId}:air-quality:sc-cache`,

  // Transit & Traffic
  transitAlerts: (cityId: string) => `${cityId}:transit:alerts`,
  trafficIncidents: (cityId: string) => `${cityId}:traffic:incidents`,

  // News
  newsDigest: (cityId: string) => `${cityId}:news:digest`,
  newsCategory: (cityId: string, cat: string) => `${cityId}:news:${cat}`,
  newsSummary: (cityId: string) => `${cityId}:news:summary`,

  // Events & Safety
  eventsUpcoming: (cityId: string) => `${cityId}:events:upcoming`,
  safetyRecent: (cityId: string) => `${cityId}:safety:recent`,
  ninaWarnings: (cityId: string) => `${cityId}:nina:warnings`,

  // Services & Infrastructure
  pharmacies: (cityId: string) => `${cityId}:pharmacies:emergency`,
  appointments: (cityId: string) => `${cityId}:appointments`,
  constructionSites: (cityId: string) => `${cityId}:construction:sites`,
  aedLocations: (cityId: string) => `${cityId}:aed:locations`,

  // Water & Environmental
  waterLevels: (cityId: string) => `${cityId}:water-levels`,
  wastewaterSummary: (cityId: string) => `${cityId}:wastewater:summary`,
  bathingSpots: (cityId: string) => `${cityId}:bathing:spots`,

  // Political
  political: (cityId: string, level: string) => `${cityId}:political:${level}`,

  // Emergency Services
  feuerwehr: (cityId: string) => `${cityId}:feuerwehr`,

  // Health
  pollen: (cityId: string) => `${cityId}:pollen`,

  // Noise
  noiseSensors: (cityId: string) => `${cityId}:noise-sensors`,

  // Economics
  laborMarket: (cityId: string) => `${cityId}:labor-market`,
  budget: (cityId: string) => `${cityId}:budget`,
  socialAtlasGeojson: (cityId: string) => `${cityId}:social-atlas:geojson`,
  populationGeojson: (cityId: string) => `${cityId}:population:geojson`,
  populationSummary: (cityId: string) => `${cityId}:population:summary`,

  // History
  weatherHistory: (cityId: string, days: number) => `${cityId}:weather:history:${days}d`,
  aqiHistory: (cityId: string, days: number) => `${cityId}:aqi:history:${days}d`,
  waterLevelHistory: (cityId: string, days: number) => `${cityId}:water-levels:history:${days}d`,
  laborMarketHistory: (cityId: string, days: number) => `${cityId}:labor-market:history:${days}d`,

  /** All domain keys included in the bootstrap endpoint. */
  bootstrapKeys: (cityId: string) => [
    CK.newsDigest(cityId),
    CK.weather(cityId),
    CK.transitAlerts(cityId),
    CK.eventsUpcoming(cityId),
    CK.safetyRecent(cityId),
    CK.ninaWarnings(cityId),
    CK.airQuality(cityId),
    CK.pharmacies(cityId),
    CK.aedLocations(cityId),
    CK.trafficIncidents(cityId),
    CK.constructionSites(cityId),
    CK.waterLevels(cityId),
    CK.budget(cityId),
    CK.appointments(cityId),
    CK.feuerwehr(cityId),
    CK.laborMarket(cityId),
    CK.wastewaterSummary(cityId),
    CK.populationSummary(cityId),
    CK.pollen(cityId),
    CK.noiseSensors(cityId),
  ],
} as const;
