import { Router } from 'express';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { loadEvChargingRegister } from '../db/reads.js';
import { getCityConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { mergeEvChargingStatus, type EvChargingRegister, type EvChargingStatus } from '../lib/ev-charging.js';
import { EV_CHARGING_REGISTER_TTL_SECONDS } from '../cron/ingest-ev-charging.js';

const log = createLogger('route:ev-charging');

/**
 * `GET /api/:city/ev-charging`: the register's stations (cache → DB), with
 * the live status merged on in a city that has one (cache only). `fetchedAt`
 * is the register's; the live status carries its own `liveUpdated`.
 */
export function createEvChargingRouter(cache: Cache, db: Db | null = null) {
  const router = Router();

  router.get('/:city/ev-charging', async (req, res) => {
    const city = getCityConfig(req.params.city);
    if (!city) {
      res.status(404).json({ error: 'City not found' });
      return;
    }

    let register = cache.getWithMeta<EvChargingRegister>(CK.evChargingRegister(city.id));
    if (!register && db) {
      try {
        const result = await loadEvChargingRegister(db, city.id);
        if (result) {
          cache.set(CK.evChargingRegister(city.id), result.data, EV_CHARGING_REGISTER_TTL_SECONDS, result.fetchedAt);
          register = { data: result.data, fetchedAt: result.fetchedAt.toISOString() };
        }
      } catch (err) {
        log.error(`${city.id} DB read failed`, err);
      }
    }
    if (!register) {
      res.json({ data: null, fetchedAt: null });
      return;
    }

    const live = city.dataSources.evCharging?.liveStatus;
    const status = live ? cache.get<EvChargingStatus>(CK.evChargingStatus(city.id)) : null;
    const data = mergeEvChargingStatus(register.data, status, live?.operator ?? '');
    // A city with a live feed says so even while the status is missing (null), so the map keeps polling
    if (live && !status) data.liveUpdated = null;
    res.json({ data, fetchedAt: register.fetchedAt });
  });

  return router;
}
