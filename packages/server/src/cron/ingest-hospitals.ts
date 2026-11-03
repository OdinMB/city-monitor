/**
 * Hospitals for the emergencies map layer, by emergency tier, from each city's
 * `dataSources.hospitals`: Hamburg's hospital WFS (dl-de/by-2.0), and the
 * Bundes-Klinik-Atlas export (G-BA) for all four cities, which the owner can
 * turn off with KLINIK_ATLAS=false (the G-BA states no reuse terms). Both
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
import { isSourceEnabled } from '../lib/source-switch.js';
import { findKlinikAtlasExport, KLINIK_ATLAS_PAGE, mergeHospitals, parseHamburgHospitals, parseKlinikAtlas } from '../lib/hospitals.js';

const log = createLogger('ingest-hospitals');

const FETCH_TIMEOUT_MS = 60_000;
/** A day past the weekly run, so a failed run does not empty the layer before the next. */
export const HOSPITALS_TTL_SECONDS = 8 * 86_400;

/** The opt-out switch for the Klinik-Atlas (lib/source-switch.ts): off only with KLINIK_ATLAS=false. */
export const KLINIK_ATLAS_SWITCH = 'KLINIK_ATLAS';

/** The sources the job reads for the city now: all configured ones, less the Klinik-Atlas when switched off. */
export function activeHospitalSources(city: CityConfig, env: NodeJS.ProcessEnv = process.env): HospitalSource[] {
  return (city.dataSources.hospitals ?? []).filter((s) => s.provider !== 'klinik-atlas' || isSourceEnabled(KLINIK_ATLAS_SWITCH, env));
}

/**
 * What the API serves from the stored data: the records of the sources active
 * now, merged (a Klinik-Atlas site wins within 250 m) and sorted. The job
 * stores every source's records unmerged, so switching the Klinik-Atlas off
 * takes effect at once and brings back Hamburg's WFS records it had replaced.
 */
export function servedHospitals(data: HospitalData, city: CityConfig, env: NodeJS.ProcessEnv = process.env): HospitalData {
  const active = new Set(activeHospitalSources(city, env).map((s) => s.provider));
  return {
    hospitals: mergeHospitals([data.hospitals.filter((h) => active.has(h.source))]),
    atlasDate: active.has('klinik-atlas') ? data.atlasDate : null,
  };
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
    if (!isSourceEnabled(KLINIK_ATLAS_SWITCH) && !loggedAtlasOff) {
      loggedAtlasOff = true;
      log.info('KLINIK_ATLAS=false, skipping the Bundes-Klinik-Atlas');
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
        // Unmerged, so a failed source's records survive and the route can drop a switched-off one
        const data: HospitalData = { hospitals: lists.flat(), atlasDate };
        cache.set(CK.hospitals(city.id), data, HOSPITALS_TTL_SECONDS);
        if (db) {
          try {
            await saveHospitals(db, city.id, data);
          } catch (err) {
            log.error(`${city.id} DB write failed`, err);
          }
        }
        const merged = mergeHospitals(lists);
        const er = merged.filter((h) => h.tier !== 'none' && h.tier !== 'specialised').length;
        log.info(`${city.id}: ${merged.length} hospitals, ${er} in emergency care (${sources.map((s) => s.provider).join(' + ')})`);
      } catch (err) {
        log.error(`${city.id} hospitals failed`, err);
      }
    }
  };
}
