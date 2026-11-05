/**
 * Hamburg Tourismus' events for the events job. HHT publishes its export once
 * a day, while the job runs every 6 hours, so the export is downloaded at most
 * once in DOWNLOAD_INTERVAL_MS; in between, the job serves the last download,
 * from memory or, after a restart, from its saved rows.
 */
import type { CityEvent, EventSourceConfig } from '@city-monitor/shared';
import type { Db } from '../db/index.js';
import { loadLatestEventBatch } from '../db/reads.js';
import { fetchHhtEvents, hhtFtpSettings, type HhtFtpSettings } from '../lib/hht-ftp.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ingest-events:hht');

const DOWNLOAD_INTERVAL_MS = 20 * 60 * 60 * 1000;

export interface SourceFetch {
  events: CityEvent[];
  /** False for events already saved, so their fetch time keeps telling when the export was last downloaded */
  save: boolean;
}

interface Deps {
  download: (settings: HhtFtpSettings, now: Date, options: { lookaheadDays?: number }) => Promise<CityEvent[]>;
  now: () => Date;
  env: Record<string, string | undefined>;
  warn: (message: string) => void;
}

export function createHhtSource(deps: Partial<Deps> = {}) {
  const { download, now, env, warn }: Deps = {
    download: fetchHhtEvents,
    now: () => new Date(),
    env: process.env,
    warn: (message) => log.warn(message),
    ...deps,
  };
  const lastDownload = new Map<string, { at: number; events: CityEvent[] }>();
  let warnedMissingCredentials = false;

  async function lastBatch(cityId: string, db: Db | null): Promise<{ at: number; events: CityEvent[] } | undefined> {
    const remembered = lastDownload.get(cityId);
    if (remembered || !db) return remembered;
    try {
      const saved = await loadLatestEventBatch(db, cityId, 'hht');
      return saved ? { at: saved.fetchedAt.getTime(), events: saved.data } : undefined;
    } catch (err) {
      log.error(`${cityId} reading the saved HHT events failed`, err);
      return undefined;
    }
  }

  return {
    async fetch(cityId: string, config: EventSourceConfig, db: Db | null): Promise<SourceFetch> {
      const settings = hhtFtpSettings(config.url, env);
      if (!settings) {
        if (!warnedMissingCredentials) {
          warn('HHT_FTP_USER or HHT_FTP_PASSWORD not set: skipping Hamburg Tourismus events');
          warnedMissingCredentials = true;
        }
        return { events: [], save: false };
      }

      const at = now();
      const previous = await lastBatch(cityId, db);
      if (previous && at.getTime() - previous.at < DOWNLOAD_INTERVAL_MS) {
        return { events: previous.events, save: false };
      }

      try {
        const events = await download(settings, at, { lookaheadDays: config.lookaheadDays });
        lastDownload.set(cityId, { at: at.getTime(), events });
        return { events, save: true };
      } catch (err) {
        if (!previous) throw err;
        log.error(`${cityId} HHT download failed, serving the last one`, err);
        return { events: previous.events, save: false };
      }
    },
  };
}
