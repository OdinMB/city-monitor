/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { CityConfig, PoliticalDistrict, Representative } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('ingest-political');

export type { PoliticalDistrict, Representative };

const API_BASE = 'https://www.abgeordnetenwatch.de/api/v2';
const TIMEOUT_MS = 30_000;
const TTL_SECONDS = 604800; // 7 days

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

export function createPoliticalIngestion(cache: Cache) {
  return async function ingestPolitical(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (city.country !== 'DE') continue;
      const config = PARLIAMENT_CONFIG[city.id];
      if (!config) continue;

      try {
        await ingestCityPolitical(city, config, cache);
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
      + `&range_end=${pageSize}`;

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
  const url = `${API_BASE}/parliament-periods`
    + `?parliament=${parliamentId}`
    + `&sort_by=start_date_period`
    + `&sort_direction=desc`
    + `&range_end=1`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { data: Array<{ id: number }> };
  return data.data[0]?.id ?? null;
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
  return fractionLabel;
}

function mandateToRepresentative(m: AW_Mandate, role: string): Representative {
  const party = m.fraction_membership?.[0]?.fraction?.label ?? 'Parteilos';
  return {
    name: m.politician.label,
    party: normalizeParty(party),
    role,
    profileUrl: m.politician.abgeordnetenwatch_url,
    constituency: m.electoral_data?.constituency?.label,
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

async function ingestCityPolitical(
  city: CityConfig,
  config: ParliamentConfig,
  cache: Cache,
): Promise<void> {
  // Fetch current Bundestag period dynamically
  const bundestagPeriodId = await fetchCurrentPeriod(config.bundestag.parliamentId);
  if (!bundestagPeriodId) {
    log.warn(`${city.id}: could not determine current Bundestag period`);
    return;
  }

  const allBundestag = await fetchMandates(bundestagPeriodId);
  const cityBundestag = filterBundestagForCity(allBundestag, city.name);

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

  cache.set(`${city.id}:political:bundestag`, bundestagDistricts, TTL_SECONDS);
  log.info(`${city.id}: ${bundestagDistricts.length} Bundestag constituencies, ${cityBundestag.length} MdBs`);

  // State parliament mandates
  const statePeriodId = await fetchCurrentPeriod(config.state.parliamentId);
  if (statePeriodId) {
    const stateMandates = await fetchMandates(statePeriodId);
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

    cache.set(`${city.id}:political:state`, stateDistricts, TTL_SECONDS);
    log.info(`${city.id}: ${stateDistricts.length} state constituencies, ${stateReps.length} ${config.state.role}s`);
  }
}
