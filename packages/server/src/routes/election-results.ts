import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadElectionResults } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { ELECTION_RESULTS_TTL_SECONDS } from '../cron/ingest-election-results.js';

const log = createLogger('route:election-results');

/**
 * `GET /api/:city/election-results`: the latest election's result per area and
 * city-wide (`ElectionResults`). `GET /api/:city/election-results/geojson`: the
 * areas' polygons with their strongest party, for the map. Both read the
 * cache, then the database, then answer `data: null`.
 */
export function createElectionResultsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  const serve = (part: 'results' | 'geojson') => async (req: { params: { city: string } }, res: import('express').Response) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }
    const key = part === 'results' ? CK.electionResults(city.id) : CK.electionGeojson(city.id);
    const cached = cache.getWithMeta<unknown>(key);
    if (cached) {
      res.json(cached);
      return;
    }
    if (db) {
      try {
        const result = await loadElectionResults(db, city.id);
        if (result) {
          cache.set(CK.electionResults(city.id), result.data.results, ELECTION_RESULTS_TTL_SECONDS, result.fetchedAt);
          cache.set(CK.electionGeojson(city.id), result.data.geojson, ELECTION_RESULTS_TTL_SECONDS, result.fetchedAt);
          res.json({ data: result.data[part], fetchedAt: result.fetchedAt.toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }
    res.json({ data: null, fetchedAt: null });
  };

  router.get('/:city/election-results', serve('results'));
  router.get('/:city/election-results/geojson', serve('geojson'));
  return router;
}
