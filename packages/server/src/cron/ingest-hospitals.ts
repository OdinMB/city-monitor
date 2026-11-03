/**
 * Hospitals for the emergencies map layer, by emergency tier, from each city's
 * `dataSources.hospitals`: Hamburg's hospital WFS (dl-de/by-2.0), and the
 * Bundes-Klinik-Atlas export (G-BA) for all four cities, which is read only
 * with KLINIK_ATLAS_ENABLED=true because the G-BA states no reuse terms. Both
 * change a few times a year, so the job runs weekly. See .context/hospitals.md.
 */
import type { CityConfig, Hospital, HospitalData, HospitalSource } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { saveHospitals } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';
import { listZipEntries, openZipEntry } from '../lib/zip.js';
import { findKlinikAtlasExport, KLINIK_ATLAS_PAGE, mergeHospitals, parseHamburgHospitals, parseKlinikAtlas } from '../lib/hospitals.js';

const log = createLogger('ingest-hospitals');

const FETCH_TIMEOUT_MS = 60_000;
/** A day past the weekly run, so a failed run does not empty the layer before the next. */
export const HOSPITALS_TTL_SECONDS = 8 * 86_400;

/** Whether the owner has switched the Klinik-Atlas on (set only after the G-BA confirms reuse). */
export function klinikAtlasEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.KLINIK_ATLAS_ENABLED?.trim().toLowerCase() === 'true';
}

/** The sources the job reads for the city now: the Klinik-Atlas only when enabled. */
export function activeHospitalSources(city: CityConfig, env: NodeJS.ProcessEnv = process.env): HospitalSource[] {
  return (city.dataSources.hospitals ?? []).filter((s) => s.provider !== 'klinik-atlas' || klinikAtlasEnabled(env));
}

const headers = { 'User-Agent': 'CityMonitor/1.0 (+https://citymonitor.app)' };

/** The current export's XML and date, found on the open-data page; null on any failure. */
async function fetchKlinikAtlas(): Promise<{ xml: string; date: string } | null> {
  const page = await log.fetch(KLINIK_ATLAS_PAGE, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers });
  if (!page.ok) {
    log.warn(`Klinik-Atlas page returned ${page.status}`);
    return null;
  }
  const found = findKlinikAtlasExport(await page.text());
  if (!found) {
    log.warn('Klinik-Atlas page links no Datenexport ZIP');
    return null;
  }
  const res = await log.fetch(found.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers });
  if (!res.ok) {
    log.warn(`Klinik-Atlas export returned ${res.status}`);
    return null;
  }
  const zip = Buffer.from(await res.arrayBuffer());
  // The ZIP also holds macOS resource forks (__MACOSX/._…) and the XSD
  const entry = listZipEntries(zip).find((e) => /_TVERZ_Export\.xml$/i.test(e.name) && !e.name.includes('__MACOSX'));
  if (!entry) {
    log.warn('Klinik-Atlas export holds no TVERZ_Export.xml');
    return null;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of openZipEntry(zip, entry)) chunks.push(chunk as Buffer);
  return { xml: Buffer.concat(chunks).toString('utf8'), date: found.date };
}

async function fetchHamburgWfs(city: CityConfig, url: string): Promise<Hospital[] | null> {
  const res = await log.fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { ...headers, Accept: 'application/geo+json' } });
  if (!res.ok) {
    log.warn(`${city.id}: hospital WFS returned ${res.status}`);
    return null;
  }
  const parsed = parseHamburgHospitals(await res.json());
  if (!parsed || parsed.length === 0) {
    log.warn(`${city.id}: hospital WFS answer has no hospitals`);
    return null;
  }
  return parsed;
}

let loggedAtlasOff = false;

export function createHospitalIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestHospitals(): Promise<void> {
    const cities = getActiveCities().filter((c) => (c.dataSources.hospitals?.length ?? 0) > 0);
    if (cities.some((c) => c.dataSources.hospitals!.some((s) => s.provider === 'klinik-atlas')) && !klinikAtlasEnabled() && !loggedAtlasOff) {
      loggedAtlasOff = true;
      log.info('KLINIK_ATLAS_ENABLED not set, skipping the Bundes-Klinik-Atlas (reuse terms unconfirmed)');
    }
    // One download for every city, only when a city reads it
    let atlas: Promise<{ xml: string; date: string } | null> | null = null;
    const getAtlas = () => (atlas ??= fetchKlinikAtlas().catch((err) => {
      log.error('Klinik-Atlas failed', err);
      return null;
    }));

    for (const city of cities) {
      const sources = activeHospitalSources(city);
      if (sources.length === 0) continue;
      try {
        const previous = cache.get<HospitalData>(CK.hospitals(city.id));
        const lists: Hospital[][] = [];
        let atlasDate: string | null = null;
        let fresh = 0;
        for (const source of sources) {
          let got: Hospital[] | null = null;
          try {
            if (source.provider === 'klinik-atlas') {
              const a = await getAtlas();
              got = a ? parseKlinikAtlas(a.xml, source.places) : null;
              if (got && got.length === 0) {
                log.warn(`${city.id}: Klinik-Atlas lists no site in ${source.places.join(', ')}`);
                got = null;
              }
              if (got) atlasDate = a!.date;
            } else {
              got = await fetchHamburgWfs(city, source.url);
            }
          } catch (err) {
            log.error(`${city.id}: ${source.provider} failed`, err);
          }
          if (got) {
            fresh++;
            lists.push(got);
          } else {
            // A failed source keeps its hospitals from the last run
            lists.push(previous?.hospitals.filter((h) => h.source === source.provider) ?? []);
            if (source.provider === 'klinik-atlas') atlasDate = previous?.atlasDate ?? null;
          }
        }
        if (fresh === 0) {
          log.warn(`${city.id}: no hospital source could be read, keeping the previous data`);
          continue;
        }
        const data: HospitalData = { hospitals: mergeHospitals(lists), atlasDate };
        cache.set(CK.hospitals(city.id), data, HOSPITALS_TTL_SECONDS);
        if (db) {
          try {
            await saveHospitals(db, city.id, data);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        const er = data.hospitals.filter((h) => h.tier !== 'none' && h.tier !== 'specialised').length;
        log.info(`${city.id}: ${data.hospitals.length} hospitals, ${er} in emergency care (${sources.map((s) => s.provider).join(' + ')})`);
      } catch (err) {
        log.error(`${city.id} hospitals failed`, err);
      }
    }
  };
}
