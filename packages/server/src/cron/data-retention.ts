/**
 * Prunes rows older than the configured retention period from all tables.
 * Since save functions no longer delete before inserting, historical data
 * accumulates and this cron is the sole cleanup mechanism.
 */

import { lt, notInArray } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import {
  weatherSnapshots,
  transitDisruptions,
  events,
  safetyReports,
  newsItems,
  aiSummaries,
  ninaWarnings,
  airQualityGrid,
  politicalDistricts,
  waterLevelSnapshots,
  appointmentSnapshots,
  budgetSnapshots,
  constructionSnapshots,
  trafficSnapshots,
  pharmacySnapshots,
  aedSnapshots,
  socialAtlasSnapshots,
  wastewaterSnapshots,
  bathingSnapshots,
  laborMarketSnapshots,
  feuerwehrSnapshots,
  pollenSnapshots,
  noiseSensorSnapshots,
  councilMeetingSnapshots,
} from '../db/schema.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('data-retention');

const DAY_MS = 86_400_000;

/** Retention periods by table type */
const RETENTION = {
  /** Frequently updated snapshots (weather, traffic, transit) */
  frequent: 7 * DAY_MS,
  /** Moderately updated data (news, events, safety, bathing, pharmacies) */
  moderate: 7 * DAY_MS,
  /** Air quality grid — extended for historical AQI charts */
  airQuality: 30 * DAY_MS,
  /** Water levels — extended for historical level charts */
  waterLevels: 30 * DAY_MS,
  /** Infrequently updated data (budget, political, social atlas, AEDs) */
  infrequent: 30 * DAY_MS,
  /** Labor market — extended to 24 months for unemployment trend charts */
  laborMarket: 730 * DAY_MS,
  /** AI-generated content */
  summaries: 30 * DAY_MS,
} as const;

export function createDataRetention(db: Db) {
  return async () => {
    const now = Date.now();
    let cleaned = 0;

    const tasks: Array<{ name: string; fn: () => Promise<unknown> }> = [
      // Frequent snapshots (7 days)
      { name: 'weather', fn: () => db.delete(weatherSnapshots).where(lt(weatherSnapshots.fetchedAt, new Date(now - RETENTION.frequent))) },
      { name: 'transit', fn: () => db.delete(transitDisruptions).where(lt(transitDisruptions.fetchedAt, new Date(now - RETENTION.frequent))) },
      { name: 'traffic', fn: () => db.delete(trafficSnapshots).where(lt(trafficSnapshots.fetchedAt, new Date(now - RETENTION.frequent))) },
      { name: 'construction', fn: () => db.delete(constructionSnapshots).where(lt(constructionSnapshots.fetchedAt, new Date(now - RETENTION.frequent))) },

      // Extended retention for historical charts
      { name: 'air_quality', fn: () => db.delete(airQualityGrid).where(lt(airQualityGrid.fetchedAt, new Date(now - RETENTION.airQuality))) },
      { name: 'water_levels', fn: () => db.delete(waterLevelSnapshots).where(lt(waterLevelSnapshots.fetchedAt, new Date(now - RETENTION.waterLevels))) },
      { name: 'labor_market', fn: () => db.delete(laborMarketSnapshots).where(lt(laborMarketSnapshots.fetchedAt, new Date(now - RETENTION.laborMarket))) },

      // Moderate retention (7 days)
      { name: 'news', fn: () => db.delete(newsItems).where(lt(newsItems.fetchedAt, new Date(now - RETENTION.moderate))) },
      { name: 'events', fn: () => db.delete(events).where(lt(events.fetchedAt, new Date(now - RETENTION.moderate))) },
      { name: 'safety', fn: () => db.delete(safetyReports).where(lt(safetyReports.fetchedAt, new Date(now - RETENTION.moderate))) },
      { name: 'nina', fn: () => db.delete(ninaWarnings).where(lt(ninaWarnings.fetchedAt, new Date(now - RETENTION.moderate))) },
      { name: 'bathing', fn: () => db.delete(bathingSnapshots).where(lt(bathingSnapshots.fetchedAt, new Date(now - RETENTION.moderate))) },
      { name: 'pharmacies', fn: () => db.delete(pharmacySnapshots).where(lt(pharmacySnapshots.fetchedAt, new Date(now - RETENTION.moderate))) },
      { name: 'appointments', fn: () => db.delete(appointmentSnapshots).where(lt(appointmentSnapshots.fetchedAt, new Date(now - RETENTION.moderate))) },
      { name: 'wastewater', fn: () => db.delete(wastewaterSnapshots).where(lt(wastewaterSnapshots.fetchedAt, new Date(now - RETENTION.moderate))) },

      { name: 'feuerwehr', fn: () => db.delete(feuerwehrSnapshots).where(lt(feuerwehrSnapshots.fetchedAt, new Date(now - RETENTION.infrequent))) },
      { name: 'pollen', fn: () => db.delete(pollenSnapshots).where(lt(pollenSnapshots.fetchedAt, new Date(now - RETENTION.moderate))) },
      { name: 'noise_sensors', fn: () => db.delete(noiseSensorSnapshots).where(lt(noiseSensorSnapshots.fetchedAt, new Date(now - RETENTION.moderate))) },
      { name: 'council_meetings', fn: () => db.delete(councilMeetingSnapshots).where(lt(councilMeetingSnapshots.fetchedAt, new Date(now - RETENTION.moderate))) },

      // Infrequent data (30 days)
      { name: 'budget', fn: () => db.delete(budgetSnapshots).where(lt(budgetSnapshots.fetchedAt, new Date(now - RETENTION.infrequent))) },
      { name: 'political', fn: () => db.delete(politicalDistricts).where(lt(politicalDistricts.fetchedAt, new Date(now - RETENTION.infrequent))) },
      { name: 'social_atlas', fn: () => db.delete(socialAtlasSnapshots).where(lt(socialAtlasSnapshots.fetchedAt, new Date(now - RETENTION.infrequent))) },
      { name: 'aeds', fn: () => db.delete(aedSnapshots).where(lt(aedSnapshots.fetchedAt, new Date(now - RETENTION.infrequent))) },

      // AI summaries (30 days)
      { name: 'summaries', fn: () => db.delete(aiSummaries).where(lt(aiSummaries.generatedAt, new Date(now - RETENTION.summaries))) },

      // Orphaned summaries: delete summaries whose headlineHash no longer exists in newsItems
      { name: 'orphan_summaries', fn: () => db.delete(aiSummaries).where(
        notInArray(aiSummaries.headlineHash, db.select({ hash: newsItems.hash }).from(newsItems))
      ) },
    ];

    for (const task of tasks) {
      try {
        await task.fn();
        cleaned++;
      } catch (err) {
        log.error(`cleanup ${task.name} failed`, err);
      }
    }

    log.info(`data retention complete (${cleaned}/${tasks.length} tables cleaned)`);
  };
}
