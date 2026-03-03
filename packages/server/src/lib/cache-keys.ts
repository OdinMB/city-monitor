/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

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

  // Economics
  laborMarket: (cityId: string) => `${cityId}:labor-market`,
  budget: (cityId: string) => `${cityId}:budget`,
  socialAtlasGeojson: (cityId: string) => `${cityId}:social-atlas:geojson`,

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
    CK.trafficIncidents(cityId),
    CK.constructionSites(cityId),
    CK.waterLevels(cityId),
    CK.budget(cityId),
    CK.appointments(cityId),
    CK.laborMarket(cityId),
    CK.wastewaterSummary(cityId),
  ],
} as const;
