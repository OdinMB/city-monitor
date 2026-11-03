import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadCitizenReports } from '../db/reads.js';
import type { CitizenReportData } from '@city-monitor/shared';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { CITIZEN_REPORTS_TTL_SECONDS } from '../cron/ingest-citizen-reports.js';

const log = createLogger('route:citizen-reports');

export function createCitizenReportsRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/citizen-reports', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    const cached = cache.getWithMeta<CitizenReportData>(CK.citizenReports(city.id));
    if (cached) {
      res.json(cached);
      return;
    }

    if (db) {
      try {
        const result = await loadCitizenReports(db, city.id);
        if (result) {
          cache.set(CK.citizenReports(city.id), result.data, CITIZEN_REPORTS_TTL_SECONDS, result.fetchedAt);
          res.json({ data: result.data, fetchedAt: result.fetchedAt.toISOString() });
          return;
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }

    res.json({ data: null, fetchedAt: null });
  });

  return router;
}
