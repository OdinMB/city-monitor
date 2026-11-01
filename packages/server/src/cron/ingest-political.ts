import type { CityConfig, PoliticalDistrict, Representative } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { savePoliticalDistricts } from '../db/writes.js';
import { loadPoliticalFetchedAt } from '../db/reads.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-political');

export type { PoliticalDistrict, Representative };

const API_BASE = 'https://www.abgeordnetenwatch.de/api/v2';
const TIMEOUT_MS = 30_000;
const TTL_SECONDS = 604800; // 7 days
/**
 * The API fetch is skipped when the stored data is younger than this. It is a
 * day shorter than the weekly cron interval: the previous run stored its data a
 * few seconds after 04:00, so a 7-day cut-off made every other weekly run skip
 * and stretched the refresh to 14 days, past both the cache TTL and the 7-day
 * snapshot retention.
 */
const SKIP_FETCH_IF_YOUNGER_THAN_MS = 6 * 86_400_000;

const STALENESS_THRESHOLD_DAYS = 180;

/**
 * A hand-kept list of office holders, with the date it was last checked
 * against `source`. preCacheBezirke warns when the check is older than
 * STALENESS_THRESHOLD_DAYS; `.context/new-data-sources.md` ("Data freshness
 * inventory") says when the offices next change hands.
 */
interface HandKeptTable {
  lastVerified: string;
  source: string;
  districts: PoliticalDistrict[];
}

/**
 * Hardcoded Bezirksbürgermeister per city (the `bezirke` level).
 * München's 25 Bezirksausschuss chairs are left out: 25 honorary posts that
 * the city publishes only as one page per Bezirksausschuss, too many to keep
 * by hand and with no open dataset to read them from.
 */
const BEZIRKSBUERGERMEISTER: Record<string, HandKeptTable> = {
  berlin: { lastVerified: '2026-03-02', source: 'https://berlin.de/rbmskzl/regierender-buergermeister/buergermeister-von-berlin/rat-der-buergermeister/', districts: [
    { id: 'bm-mitte', name: 'Mitte', level: 'bezirk', representatives: [{ name: 'Stefanie Remlinger', party: 'Grüne', role: 'Bezirksbürgermeisterin', profileUrl: 'https://www.berlin.de/ba-mitte/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-friedrichshain-kreuzberg', name: 'Friedrichshain-Kreuzberg', level: 'bezirk', representatives: [{ name: 'Clara Herrmann', party: 'Grüne', role: 'Bezirksbürgermeisterin', profileUrl: 'https://www.berlin.de/ba-friedrichshain-kreuzberg/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-pankow', name: 'Pankow', level: 'bezirk', representatives: [{ name: 'Dr. Cordelia Koch', party: 'Grüne', role: 'Bezirksbürgermeisterin', profileUrl: 'https://www.berlin.de/ba-pankow/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-charlottenburg-wilmersdorf', name: 'Charlottenburg-Wilmersdorf', level: 'bezirk', representatives: [{ name: 'Kirstin Bauch', party: 'Grüne', role: 'Bezirksbürgermeisterin', profileUrl: 'https://www.berlin.de/ba-charlottenburg-wilmersdorf/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-spandau', name: 'Spandau', level: 'bezirk', representatives: [{ name: 'Frank Bewig', party: 'CDU', role: 'Bezirksbürgermeister', profileUrl: 'https://www.berlin.de/ba-spandau/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-steglitz-zehlendorf', name: 'Steglitz-Zehlendorf', level: 'bezirk', representatives: [{ name: 'Maren Schellenberg', party: 'Grüne', role: 'Bezirksbürgermeisterin', profileUrl: 'https://www.berlin.de/ba-steglitz-zehlendorf/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-tempelhof-schoeneberg', name: 'Tempelhof-Schöneberg', level: 'bezirk', representatives: [{ name: 'Jörn Oltmann', party: 'Grüne', role: 'Bezirksbürgermeister', profileUrl: 'https://www.berlin.de/ba-tempelhof-schoeneberg/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-neukoelln', name: 'Neukölln', level: 'bezirk', representatives: [{ name: 'Martin Hikel', party: 'SPD', role: 'Bezirksbürgermeister', profileUrl: 'https://www.berlin.de/ba-neukoelln/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-treptow-koepenick', name: 'Treptow-Köpenick', level: 'bezirk', representatives: [{ name: 'Oliver Igel', party: 'SPD', role: 'Bezirksbürgermeister', profileUrl: 'https://www.berlin.de/ba-treptow-koepenick/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-marzahn-hellersdorf', name: 'Marzahn-Hellersdorf', level: 'bezirk', representatives: [{ name: 'Nadja Zivkovic', party: 'CDU', role: 'Bezirksbürgermeisterin', profileUrl: 'https://www.berlin.de/ba-marzahn-hellersdorf/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-lichtenberg', name: 'Lichtenberg', level: 'bezirk', representatives: [{ name: 'Martin Schaefer', party: 'CDU', role: 'Bezirksbürgermeister', profileUrl: 'https://www.berlin.de/ba-lichtenberg/politik-und-verwaltung/bezirksamt/' }] },
    { id: 'bm-reinickendorf', name: 'Reinickendorf', level: 'bezirk', representatives: [{ name: 'Emine Demirbüken-Wegner', party: 'CDU', role: 'Bezirksbürgermeisterin', profileUrl: 'https://www.berlin.de/ba-reinickendorf/politik-und-verwaltung/bezirksamt/' }] },
  ] },
  // Elected by the Bezirksvertretungen after the local elections of
  // 14 September 2025; next local elections in 2030. One page per Stadtbezirk.
  koeln: { lastVerified: '2026-11-01', source: 'https://www.stadt-koeln.de/politik-und-verwaltung/bezirksvertretungen/', districts: [
    koelnBezirk('innenstadt', 'Innenstadt', 'Julie Cazier', 'Grüne', 'Bezirksbürgermeisterin'),
    koelnBezirk('rodenkirchen', 'Rodenkirchen', 'Dr. Sabine Müller', 'Grüne', 'Bezirksbürgermeisterin'),
    koelnBezirk('lindenthal', 'Lindenthal', 'Roland Schüler', 'Grüne', 'Bezirksbürgermeister'),
    koelnBezirk('ehrenfeld', 'Ehrenfeld', 'Volker Spelthann', 'Grüne', 'Bezirksbürgermeister'),
    koelnBezirk('nippes', 'Nippes', 'Dr. Diana Siebert', 'Grüne', 'Bezirksbürgermeisterin'),
    koelnBezirk('chorweiler', 'Chorweiler', 'Daniel Alexander Kastenholz', 'CDU', 'Bezirksbürgermeister'),
    koelnBezirk('porz', 'Porz', 'Lutz Tempel', 'SPD', 'Bezirksbürgermeister'),
    koelnBezirk('kalk', 'Kalk', 'Claudia Greven-Thürmer', 'SPD', 'Bezirksbürgermeisterin'),
    koelnBezirk('muelheim', 'Mülheim', 'Vincent Morawietz', 'SPD', 'Bezirksbürgermeister'),
  ] },
};

function koelnBezirk(slug: string, name: string, person: string, party: string, role: string): PoliticalDistrict {
  return {
    id: `bm-${slug}`,
    name,
    level: 'bezirk',
    representatives: [{ name: person, party, role, profileUrl: `https://www.stadt-koeln.de/politik-und-verwaltung/bezirksvertretungen/bezirksvertretung-${slug}` }],
  };
}

/**
 * Hardcoded Oberbürgermeister per city (the `mayor` level), for cities inside
 * a state. A city-state's head of government is not listed: Berlin and
 * Hamburg show their district mayors and parliaments only.
 */
const OBERBUERGERMEISTER: Record<string, HandKeptTable> = {
  // In office since 1 November 2025 (run-off of 28 September 2025); next election 2030.
  koeln: { lastVerified: '2026-11-01', source: 'https://www.stadt-koeln.de/politik-und-verwaltung/oberbuergermeister/torsten-burmester', districts: [
    { id: 'ob-koeln', name: 'Köln', level: 'stadt', representatives: [{ name: 'Torsten Burmester', party: 'SPD', role: 'Oberbürgermeister', profileUrl: 'https://www.stadt-koeln.de/politik-und-verwaltung/oberbuergermeister/torsten-burmester' }] },
  ] },
  // In office since 1 May 2026 (local elections of March 2026); next election 2032.
  muenchen: { lastVerified: '2026-11-01', source: 'https://stadt.muenchen.de/infos/oberbuergermeister.html', districts: [
    { id: 'ob-muenchen', name: 'München', level: 'stadt', representatives: [{ name: 'Dominik Krause', party: 'Grüne', role: 'Oberbürgermeister', profileUrl: 'https://stadt.muenchen.de/infos/oberbuergermeister.html' }] },
  ] },
};

/**
 * Bezirk names per city for the constituency-to-Bezirk mapping, which groups
 * the state parliament's members by Bezirk. Berlin's state constituencies are
 * named after their Bezirk ("Pankow 3"); Hamburg's Bürgerschaft constituencies
 * are not, so Hamburg has no entry.
 */
const STATE_CONSTITUENCY_BEZIRKE: Record<string, string[]> = {
  berlin: [
    'Mitte',
    'Friedrichshain-Kreuzberg',
    'Pankow',
    'Charlottenburg-Wilmersdorf',
    'Spandau',
    'Steglitz-Zehlendorf',
    'Tempelhof-Schöneberg',
    'Neukölln',
    'Treptow-Köpenick',
    'Marzahn-Hellersdorf',
    'Lichtenberg',
    'Reinickendorf',
  ],
};

/** Whether the city has hand-maintained district mayors (BEZIRKSBUERGERMEISTER). */
export function hasDistrictMayors(city: CityConfig): boolean {
  return Object.hasOwn(BEZIRKSBUERGERMEISTER, city.id);
}

/** Whether the city has a hand-maintained Oberbürgermeister (OBERBUERGERMEISTER). */
export function hasMayor(city: CityConfig): boolean {
  return Object.hasOwn(OBERBUERGERMEISTER, city.id);
}

/** The area names of a hand-kept level for a city (Bezirke, or the city itself for its Oberbürgermeister); none without a table. */
export function handKeptAreas(level: 'bezirke' | 'mayor', cityId: string): string[] {
  const tables = level === 'bezirke' ? BEZIRKSBUERGERMEISTER : OBERBUERGERMEISTER;
  return Object.hasOwn(tables, cityId) ? tables[cityId]!.districts.map((d) => d.name) : [];
}

/** The hand-kept levels and their tables, in the order they are cached. */
const HAND_KEPT_LEVELS: ReadonlyArray<[level: string, tables: Record<string, HandKeptTable>, what: string]> = [
  ['bezirke', BEZIRKSBUERGERMEISTER, 'Bezirksbuergermeister'],
  ['mayor', OBERBUERGERMEISTER, 'Oberbuergermeister'],
];

/** Whether the political job groups the city's state members by Bezirk (the `state-bezirke` level). */
export function groupsStateMembersByBezirk(city: CityConfig): boolean {
  return Object.hasOwn(STATE_CONSTITUENCY_BEZIRKE, city.id);
}

/**
 * Parliament IDs on abgeordnetenwatch.de.
 * Key = cityId, value = { bundestag parliament ID, state parliament ID }.
 * Period IDs are fetched dynamically (most recent period for each parliament).
 *
 * Whose mandates count as the city's:
 * - A city-state (no `constituencies`): every member of its state parliament,
 *   and the Bundestag members whose constituency or Landesliste label names
 *   the city (filterBundestagForCity).
 * - A city inside a state (`constituencies`): in both parliaments, only the
 *   members whose candidacy was in one of the named constituencies, whether
 *   they won it or entered through a list (filterByConstituency). List members
 *   who stood in no constituency of the city are not counted, so the city's
 *   share of a state-wide list is never the whole list.
 */
export interface ParliamentConfig {
  /**
   * `unionParty`: what the Bundestag's joint CDU/CSU group means for the
   * city's members. Without it they show as CDU; Bavaria's are CSU, as the
   * CDU does not stand there.
   */
  bundestag: { parliamentId: number; role: string; unionParty?: 'CSU' };
  state: { parliamentId: number; role: string; label: string };
  /**
   * The constituencies within the city, as abgeordnetenwatch names them with
   * the number and period stripped (normalizeConstituencyName). Names, not
   * ids or numbers: abgeordnetenwatch issues new constituency ids for each
   * period, and the official numbers change with each redistricting. A name
   * that matches no mandate is logged, which is how a renamed constituency
   * after the next election shows.
   */
  constituencies?: { bundestag: readonly string[]; state: readonly string[] };
}

/** Bundestag parliament ID on abgeordnetenwatch.de */
const BUNDESTAG_PARLIAMENT_ID = 5;

export const PARLIAMENT_CONFIG: Readonly<Record<string, ParliamentConfig>> = {
  berlin: {
    bundestag: { parliamentId: BUNDESTAG_PARLIAMENT_ID, role: 'MdB' },
    state: { parliamentId: 2, role: 'MdA', label: 'Abgeordnetenhaus' },
  },
  hamburg: {
    bundestag: { parliamentId: BUNDESTAG_PARLIAMENT_ID, role: 'MdB' },
    state: { parliamentId: 3, role: 'MdHB', label: 'Bürgerschaft' },
  },
  koeln: {
    bundestag: { parliamentId: BUNDESTAG_PARLIAMENT_ID, role: 'MdB' },
    state: { parliamentId: 4, role: 'MdL', label: 'Landtag Nordrhein-Westfalen' },
    constituencies: {
      // Bundestag 2025: Wahlkreise 92–94 and 100. Köln IV shares its
      // Wahlkreis with Leverkusen, so its member also represents Leverkusen.
      bundestag: ['Köln I', 'Köln II', 'Köln III', 'Leverkusen – Köln IV'],
      // Landtag 2022: Wahlkreise 13–19, all within the city.
      state: ['Köln I', 'Köln II', 'Köln III', 'Köln IV', 'Köln V', 'Köln VI', 'Köln VII'],
    },
  },
  muenchen: {
    bundestag: { parliamentId: BUNDESTAG_PARLIAMENT_ID, role: 'MdB', unionParty: 'CSU' },
    state: { parliamentId: 13, role: 'MdL', label: 'Bayerischer Landtag' },
    constituencies: {
      // Bundestag 2025: Wahlkreise 216–219. München-Land (220) is the
      // Landkreis around the city, not the city.
      bundestag: ['München-Nord', 'München-Ost', 'München-Süd', 'München-West/Mitte'],
      // Landtag 2023: the nine Stimmkreise 101–109 of Wahlkreis Oberbayern
      // within the city; München-Land-Nord and -Süd (123, 124) are the
      // Landkreis. Bavaria's list seats go to the Wahlkreis (Oberbayern), not
      // to a Stimmkreis, but every list candidate also stands in one
      // Stimmkreis, which is what places a list member in München here.
      state: [
        'München-Hadern', 'München-Bogenhausen', 'München-Giesing', 'München-Milbertshofen', 'München-Moosach',
        'München-Pasing', 'München-Ramersdorf', 'München-Schwabing', 'München-Mitte',
      ],
    },
  },
};

interface AW_Mandate {
  id: number;
  label: string;
  politician: {
    id: number;
    label: string;
    abgeordnetenwatch_url: string;
  };
  fraction_membership?: Array<{
    fraction: { label: string };
  }>;
  electoral_data?: {
    constituency?: { label: string; number?: number };
    electoral_list?: { label: string };
    list_position?: number;
  };
}

interface AW_Response {
  data: AW_Mandate[];
  meta: { result: { total: number; count: number } };
}

/**
 * Pre-cache hardcoded Bezirksbürgermeister data so it's available immediately
 * on server start, before the full political cron job runs.
 */
export function preCacheBezirke(cache: Cache): void {
  for (const city of getActiveCities()) {
    for (const [level, tables, what] of HAND_KEPT_LEVELS) {
      if (!Object.hasOwn(tables, city.id)) continue;
      const table = tables[city.id]!;
      cache.set(CK.political(city.id, level), table.districts, TTL_SECONDS);

      // The re-verify reminder is only relevant for a list that is served
      const ageDays = Math.round((Date.now() - new Date(table.lastVerified).getTime()) / 86_400_000);
      if (ageDays > STALENESS_THRESHOLD_DAYS) {
        log.warn(
          `${city.id}: ${what} data was last verified ${ageDays} days ago (${table.lastVerified}). ` +
          `Please re-verify at ${table.source}`
        );
      }
    }
  }
}

/** The cities ingestPolitical fetches: German ones with a parliament config. */
export function hasParliamentConfig(city: CityConfig): boolean {
  return city.country === 'DE' && PARLIAMENT_CONFIG[city.id] !== undefined;
}

export function createPoliticalIngestion(cache: Cache, db: Db | null) {
  return async function ingestPolitical(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (!hasParliamentConfig(city)) continue;
      const config = PARLIAMENT_CONFIG[city.id];

      try {
        await ingestCityPolitical(city, config, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

/** Returns null when any page fails, so a partial list never replaces stored data. */
async function fetchMandates(periodId: number): Promise<AW_Mandate[] | null> {
  const mandates: AW_Mandate[] = [];
  let page = 0;
  const pageSize = 100;

  while (true) {
    const url = `${API_BASE}/candidacies-mandates`
      + `?parliament_period=${periodId}`
      + `&type=mandate`
      + `&range_start=${page * pageSize}`
      + `&range_end=${(page + 1) * pageSize}`;

    const response = await log.fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'CityMonitor/1.0' },
    });

    if (!response.ok) {
      log.warn(`abgeordnetenwatch returned ${response.status} for mandates page ${page}`);
      return null;
    }

    const data = (await response.json()) as AW_Response;
    mandates.push(...data.data);

    if (mandates.length >= data.meta.result.total || data.data.length < pageSize) {
      break;
    }
    page++;
  }

  return mandates;
}

async function fetchCurrentPeriod(parliamentId: number): Promise<number | null> {
  // Fetch several recent periods so we can filter for legislature (not election) type
  const url = `${API_BASE}/parliament-periods`
    + `?parliament=${parliamentId}`
    + `&sort_by=start_date_period`
    + `&sort_direction=desc`
    + `&range_end=5`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { data: Array<{ id: number; type: string }> };
  // Prefer legislature periods — election periods have no mandate data
  const legislature = data.data.find((p) => p.type === 'legislature');
  return legislature?.id ?? data.data[0]?.id ?? null;
}

export function normalizeParty(fractionLabel: string): string {
  if (fractionLabel.includes('SPD')) return 'SPD';
  if (fractionLabel.includes('CDU')) return 'CDU';
  if (fractionLabel.includes('CSU')) return 'CSU';
  if (fractionLabel.includes('GRÜNE') || fractionLabel.includes('Grüne')) return 'Grüne';
  if (fractionLabel.includes('FDP')) return 'FDP';
  if (fractionLabel.includes('Linke')) return 'Die Linke';
  if (fractionLabel.includes('BSW')) return 'BSW';
  if (fractionLabel.includes('AfD')) return 'AfD';
  // Bayerischer Landtag: "FREIE WÄHLER (Bayern 2023 - 2028)"
  if (fractionLabel.toUpperCase().includes('FREIE WÄHLER')) return 'Freie Wähler';
  if (fractionLabel.toLowerCase().includes('fraktionslos')) return 'Fraktionslos';
  return fractionLabel;
}

/**
 * Normalize constituency label from abgeordnetenwatch API.
 * Input:  "78 - Berlin-Steglitz-Zehlendorf (Bundestag 2025 - 2029)"
 * Output: "Berlin-Steglitz-Zehlendorf"
 */
export function normalizeConstituencyName(label: string): string {
  // Strip leading number + dash: "78 - Berlin-Mitte (...)" → "Berlin-Mitte (...)"
  let name = label.replace(/^\d+\s*-\s*/, '');
  // Strip trailing parenthetical: "Berlin-Mitte (Bundestag 2025 - 2029)" → "Berlin-Mitte"
  name = name.replace(/\s*\([^)]*\)\s*$/, '');
  return name.trim();
}

export function mandateToRepresentative(m: AW_Mandate, role: string): Representative {
  const party = m.fraction_membership?.[0]?.fraction?.label ?? 'Parteilos';
  const rawConstituency = m.electoral_data?.constituency?.label;
  return {
    name: m.politician.label,
    party: normalizeParty(party),
    role,
    profileUrl: m.politician.abgeordnetenwatch_url,
    constituency: rawConstituency ? normalizeConstituencyName(rawConstituency) : undefined,
  };
}

/**
 * The mandates whose candidacy was in one of the named constituencies,
 * compared after normalizeConstituencyName. For a city inside a state.
 */
export function filterByConstituency(mandates: AW_Mandate[], constituencies: readonly string[]): AW_Mandate[] {
  const names = new Set(constituencies);
  return mandates.filter((m) => {
    const label = m.electoral_data?.constituency?.label;
    return label !== undefined && names.has(normalizeConstituencyName(label));
  });
}

/** The named constituencies no mandate stood in: renamed or redrawn ones, once a new period starts. */
export function unmatchedConstituencies(mandates: AW_Mandate[], constituencies: readonly string[]): string[] {
  const seen = new Set(mandates.flatMap((m) => {
    const label = m.electoral_data?.constituency?.label;
    return label ? [normalizeConstituencyName(label)] : [];
  }));
  return constituencies.filter((c) => !seen.has(c));
}

/**
 * Filter Bundestag mandates to those representing constituencies in the given city.
 * Uses constituency name heuristic (city name appears in constituency label).
 * For a city-state only: a city inside a state names its constituencies instead.
 */
export function filterBundestagForCity(mandates: AW_Mandate[], cityName: string): AW_Mandate[] {
  const lowerCity = cityName.toLowerCase();
  return mandates.filter((m) => {
    const cLabel = m.electoral_data?.constituency?.label?.toLowerCase() ?? '';
    const lLabel = m.electoral_data?.electoral_list?.label?.toLowerCase() ?? '';
    return cLabel.includes(lowerCity) || lLabel.includes(lowerCity);
  });
}

/**
 * Deduplicate mandates by politician ID.
 * The API can return multiple entries per politician (e.g. direct + list mandate).
 * Keep the first occurrence (which has constituency data for direct mandates).
 */
export function deduplicateMandates(mandates: AW_Mandate[]): AW_Mandate[] {
  const seen = new Set<number>();
  return mandates.filter((m) => {
    if (seen.has(m.politician.id)) return false;
    seen.add(m.politician.id);
    return true;
  });
}

/**
 * The mandates of one parliament that count as the city's (see
 * ParliamentConfig), one per politician. Warns about named constituencies no
 * mandate stood in.
 */
export function cityMandates(
  all: AW_Mandate[],
  parliament: 'bundestag' | 'state',
  city: CityConfig,
  config: ParliamentConfig,
): AW_Mandate[] {
  const named = config.constituencies?.[parliament];
  if (!named) {
    return deduplicateMandates(parliament === 'bundestag' ? filterBundestagForCity(all, city.name) : all);
  }
  const unmatched = unmatchedConstituencies(all, named);
  if (unmatched.length > 0) {
    log.warn(`${city.id}: no ${parliament} mandate in ${unmatched.join(', ')}; check the constituency names in PARLIAMENT_CONFIG`);
  }
  return deduplicateMandates(filterByConstituency(all, named));
}

/**
 * Map a state constituency name to its parent Bezirk.
 * E.g. "Charlottenburg-Wilmersdorf 3" → "Charlottenburg-Wilmersdorf"
 */
export function constituencyToBezirk(constituency: string, bezirke: string[]): string | null {
  const lower = constituency.toLowerCase();
  for (const b of bezirke) {
    if (lower.startsWith(b.toLowerCase())) return b;
  }
  return null;
}

async function ingestCityPolitical(
  city: CityConfig,
  config: ParliamentConfig,
  cache: Cache,
  db: Db | null,
): Promise<void> {
  // Helper: persist to DB without killing the ingestion on failure
  const persistToDb = async (level: string, districts: PoliticalDistrict[]) => {
    if (!db) return;
    try {
      await savePoliticalDistricts(db, city.id, level, districts);
    } catch (err) {
      log.error(`${city.id}: DB save for ${level} failed`, err);
    }
  };

  // Cache the hand-kept office holders (district mayors, Oberbürgermeister)
  for (const [level, tables, what] of HAND_KEPT_LEVELS) {
    if (!Object.hasOwn(tables, city.id)) continue;
    const { districts } = tables[city.id]!;
    cache.set(CK.political(city.id, level), districts, TTL_SECONDS);
    await persistToDb(level, districts);
    log.info(`${city.id}: ${districts.length} ${what} cached`);
  }

  // Skip API calls if DB data was fetched within the current weekly cycle
  if (db) {
    const fetchedAt = await loadPoliticalFetchedAt(db, city.id, 'bundestag');
    if (fetchedAt) {
      const ageMs = Date.now() - fetchedAt.getTime();
      if (ageMs < SKIP_FETCH_IF_YOUNGER_THAN_MS) {
        const ageDays = Math.round(ageMs / 86_400_000);
        log.info(`${city.id}: political data is ${ageDays}d old (refetch after 6d), skipping API fetch`);
        return;
      }
    }
  }

  // Fetch current Bundestag period dynamically
  const bundestagPeriodId = await fetchCurrentPeriod(config.bundestag.parliamentId);
  if (!bundestagPeriodId) {
    log.warn(`${city.id}: could not determine current Bundestag period`);
    return;
  }

  const allBundestag = await fetchMandates(bundestagPeriodId);
  if (!allBundestag?.length) {
    log.warn(`${city.id}: Bundestag mandates unavailable, keeping previous data`);
    return;
  }
  const cityBundestag = cityMandates(allBundestag, 'bundestag', city, config);
  if (cityBundestag.length === 0) {
    log.warn(`${city.id}: no Bundestag mandate matched the city, keeping previous data`);
    return;
  }

  const bundestagDistricts: PoliticalDistrict[] = [];
  const byConstituency = new Map<string, Representative[]>();

  for (const m of cityBundestag) {
    const rep = mandateToRepresentative(m, config.bundestag.role);
    if (config.bundestag.unionParty && rep.party === 'CDU') rep.party = config.bundestag.unionParty;
    const key = rep.constituency ?? 'Landesliste';
    const arr = byConstituency.get(key) ?? [];
    arr.push(rep);
    byConstituency.set(key, arr);
  }

  for (const [name, reps] of byConstituency) {
    bundestagDistricts.push({
      id: `bundestag-${name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      level: 'bundestag',
      representatives: reps,
    });
  }

  cache.set(CK.political(city.id, 'bundestag'), bundestagDistricts, TTL_SECONDS);
  await persistToDb('bundestag', bundestagDistricts);
  log.info(`${city.id}: ${bundestagDistricts.length} Bundestag constituencies, ${cityBundestag.length} MdBs`);

  // State parliament mandates
  const statePeriodId = await fetchCurrentPeriod(config.state.parliamentId);
  const allState = statePeriodId ? await fetchMandates(statePeriodId) : null;
  const stateMandates = allState?.length ? cityMandates(allState, 'state', city, config) : [];
  if (!allState?.length) {
    log.warn(`${city.id}: ${config.state.label} mandates unavailable, keeping previous data`);
  } else if (stateMandates.length === 0) {
    log.warn(`${city.id}: no ${config.state.label} mandate matched the city, keeping previous data`);
  } else {
    const stateReps = stateMandates.map((m) =>
      mandateToRepresentative(m, config.state.role),
    );

    const stateDistricts: PoliticalDistrict[] = [];
    const byStateConstituency = new Map<string, Representative[]>();

    for (const rep of stateReps) {
      const key = rep.constituency ?? 'Landesliste';
      const arr = byStateConstituency.get(key) ?? [];
      arr.push(rep);
      byStateConstituency.set(key, arr);
    }

    for (const [name, reps] of byStateConstituency) {
      stateDistricts.push({
        id: `state-${name.toLowerCase().replace(/\s+/g, '-')}`,
        name,
        level: 'landesparlament',
        representatives: reps,
      });
    }

    cache.set(CK.political(city.id, 'state'), stateDistricts, TTL_SECONDS);
    await persistToDb('state', stateDistricts);
    log.info(`${city.id}: ${stateDistricts.length} state constituencies, ${stateReps.length} ${config.state.role}s`);

    // Aggregate state MdAs by Bezirk for the "landesparlament on bezirke" view
    const bezirke = STATE_CONSTITUENCY_BEZIRKE[city.id] ?? [];
    if (bezirke.length > 0) {
      const byBezirk = new Map<string, Representative[]>();
      for (const rep of stateReps) {
        const bezirk = rep.constituency ? constituencyToBezirk(rep.constituency, bezirke) : null;
        if (!bezirk) continue;
        const arr = byBezirk.get(bezirk) ?? [];
        arr.push(rep);
        byBezirk.set(bezirk, arr);
      }

      const stateBezirke: PoliticalDistrict[] = [];
      for (const [name, reps] of byBezirk) {
        stateBezirke.push({
          id: `state-bezirk-${name.toLowerCase().replace(/\s+/g, '-')}`,
          name,
          level: 'landesparlament',
          representatives: reps,
        });
      }

      cache.set(CK.political(city.id, 'state-bezirke'), stateBezirke, TTL_SECONDS);
      await persistToDb('state-bezirke', stateBezirke);
      log.info(`${city.id}: ${stateBezirke.length} Bezirke with aggregated ${config.state.role}s`);
    }
  }
}
