import { Router } from 'express';
import type { NinaWarning } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import { getCityConfig } from '../config/index.js';
import { CK } from '../lib/cache-keys.js';
import { currentWarnings } from '../cron/ingest-nina.js';

export function createBootstrapRouter(cache: Cache) {
  const router = Router();

  // Bootstrap endpoint: returns all cached city data in one response.
  // NOTE: Unlike individual routes (e.g., /news/digest, /news/summary), bootstrap
  // is cache-only with no DB fallback. If the cache is cold, slots return null.
  router.get('/:city/bootstrap', (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const data = cache.getBatchWithMeta(CK.bootstrapKeys(city.id));
    // As in the NINA route: leave out the warnings that have ended since the list was cached
    const nina = data[CK.ninaWarnings(city.id)] as { data: NinaWarning[]; fetchedAt: string } | undefined;

    res.json({
      news: data[CK.newsDigest(city.id)] ?? null,
      weather: data[CK.weather(city.id)] ?? null,
      transit: data[CK.transitAlerts(city.id)] ?? null,
      events: data[CK.eventsUpcoming(city.id)] ?? null,
      safety: data[CK.safetyRecent(city.id)] ?? null,
      nina: nina ? { data: currentWarnings(nina.data), fetchedAt: nina.fetchedAt } : null,
      airQuality: data[CK.airQuality(city.id)] ?? null,
      pharmacies: data[CK.pharmacies(city.id)] ?? null,
      aeds: data[CK.aedLocations(city.id)] ?? null,
      traffic: data[CK.trafficIncidents(city.id)] ?? null,
      construction: data[CK.constructionSites(city.id)] ?? null,
      waterLevels: data[CK.waterLevels(city.id)] ?? null,
      budget: data[CK.budget(city.id)] ?? null,
      appointments: data[CK.appointments(city.id)] ?? null,
      laborMarket: data[CK.laborMarket(city.id)] ?? null,
      wastewater: data[CK.wastewaterSummary(city.id)] ?? null,
      populationSummary: data[CK.populationSummary(city.id)] ?? null,
      feuerwehr: data[CK.feuerwehr(city.id)] ?? null,
      pollen: data[CK.pollen(city.id)] ?? null,
      noiseSensors: data[CK.noiseSensors(city.id)] ?? null,
      councilMeetings: data[CK.councilMeetings(city.id)] ?? null,
    });
  });

  return router;
}
