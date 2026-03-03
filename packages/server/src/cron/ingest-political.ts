/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

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
 * Hardcoded Bezirksbürgermeister per city.
 * Source: https://berlin.de/rbmskzl/regierender-buergermeister/buergermeister-von-berlin/rat-der-buergermeister/
 * Last verified: 2026-03-02
 */
const BEZIRKSBUERGERMEISTER: Record<string, PoliticalDistrict[]> = {
  berlin: [
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
  ],
};

/** Berlin Bezirk names for constituency-to-bezirk mapping */
const BERLIN_BEZIRKE = [
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
];

/**
 * Parliament IDs on abgeordnetenwatch.de.
 * Key = cityId, value = { bundestag parliament ID, state parliament ID }.
 * Period IDs are fetched dynamically (most recent period for each parliament).
 */
interface ParliamentConfig {
  bundestag: { parliamentId: number; role: string };
  state: { parliamentId: number; role: string; label: string };
}

/** Bundestag parliament ID on abgeordnetenwatch.de */
const BUNDESTAG_PARLIAMENT_ID = 5;

const PARLIAMENT_CONFIG: Record<string, ParliamentConfig> = {
  berlin: {
    bundestag: { parliamentId: BUNDESTAG_PARLIAMENT_ID, role: 'MdB' },
    state: { parliamentId: 2, role: 'MdA', label: 'Abgeordnetenhaus' },
  },
  hamburg: {
    bundestag: { parliamentId: BUNDESTAG_PARLIAMENT_ID, role: 'MdB' },
    state: { parliamentId: 3, role: 'MdHB', label: 'Bürgerschaft' },
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
    const bmData = BEZIRKSBUERGERMEISTER[city.id];
    if (bmData) {
      cache.set(CK.political(city.id, 'bezirke'), bmData, TTL_SECONDS);
    }
  }
}

export function createPoliticalIngestion(cache: Cache, db: Db | null) {
  return async function ingestPolitical(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (city.country !== 'DE') continue;
      const config = PARLIAMENT_CONFIG[city.id];
      if (!config) continue;

      try {
        await ingestCityPolitical(city, config, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function fetchMandates(periodId: number): Promise<AW_Mandate[]> {
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
      log.warn(`abgeordnetenwatch returned ${response.status}`);
      break;
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

function normalizeParty(fractionLabel: string): string {
  if (fractionLabel.includes('SPD')) return 'SPD';
  if (fractionLabel.includes('CDU')) return 'CDU';
  if (fractionLabel.includes('CSU')) return 'CSU';
  if (fractionLabel.includes('GRÜNE') || fractionLabel.includes('Grüne')) return 'Grüne';
  if (fractionLabel.includes('FDP')) return 'FDP';
  if (fractionLabel.includes('Linke')) return 'Die Linke';
  if (fractionLabel.includes('BSW')) return 'BSW';
  if (fractionLabel.includes('AfD')) return 'AfD';
  if (fractionLabel.toLowerCase().includes('fraktionslos')) return 'Fraktionslos';
  return fractionLabel;
}

/**
 * Normalize constituency label from abgeordnetenwatch API.
 * Input:  "78 - Berlin-Steglitz-Zehlendorf (Bundestag 2025 - 2029)"
 * Output: "Berlin-Steglitz-Zehlendorf"
 */
function normalizeConstituencyName(label: string): string {
  // Strip leading number + dash: "78 - Berlin-Mitte (...)" → "Berlin-Mitte (...)"
  let name = label.replace(/^\d+\s*-\s*/, '');
  // Strip trailing parenthetical: "Berlin-Mitte (Bundestag 2025 - 2029)" → "Berlin-Mitte"
  name = name.replace(/\s*\([^)]*\)\s*$/, '');
  return name.trim();
}

function mandateToRepresentative(m: AW_Mandate, role: string): Representative {
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
 * Filter Bundestag mandates to those representing constituencies in the given city.
 * Uses constituency name heuristic (city name appears in constituency label).
 */
function filterBundestagForCity(mandates: AW_Mandate[], cityName: string): AW_Mandate[] {
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
function deduplicateMandates(mandates: AW_Mandate[]): AW_Mandate[] {
  const seen = new Set<number>();
  return mandates.filter((m) => {
    if (seen.has(m.politician.id)) return false;
    seen.add(m.politician.id);
    return true;
  });
}

/**
 * Map a state constituency name to its parent Bezirk.
 * E.g. "Charlottenburg-Wilmersdorf 3" → "Charlottenburg-Wilmersdorf"
 */
function constituencyToBezirk(constituency: string, bezirke: string[]): string | null {
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

  // Cache hardcoded Bezirksbürgermeister data
  const bmData = BEZIRKSBUERGERMEISTER[city.id];
  if (bmData) {
    cache.set(CK.political(city.id, 'bezirke'), bmData, TTL_SECONDS);
    await persistToDb('bezirke', bmData);
    log.info(`${city.id}: ${bmData.length} Bezirksbürgermeister cached`);
  }

  // Skip API calls if DB data is still fresh (fetched within the 7-day TTL)
  if (db) {
    const fetchedAt = await loadPoliticalFetchedAt(db, city.id, 'bundestag');
    if (fetchedAt) {
      const ageMs = Date.now() - fetchedAt.getTime();
      if (ageMs < TTL_SECONDS * 1000) {
        const ageDays = Math.round(ageMs / 86_400_000);
        log.info(`${city.id}: political data is ${ageDays}d old (TTL 7d), skipping API fetch`);
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
  const cityBundestag = deduplicateMandates(filterBundestagForCity(allBundestag, city.name));

  const bundestagDistricts: PoliticalDistrict[] = [];
  const byConstituency = new Map<string, Representative[]>();

  for (const m of cityBundestag) {
    const rep = mandateToRepresentative(m, config.bundestag.role);
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
  if (statePeriodId) {
    const stateMandates = deduplicateMandates(await fetchMandates(statePeriodId));
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
    const bezirke = city.id === 'berlin' ? BERLIN_BEZIRKE : [];
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
