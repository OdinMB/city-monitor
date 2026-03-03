/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { CityConfig, EmergencyPharmacy } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { savePharmacies } from '../db/writes.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';
import { CK } from '../lib/cache-keys.js';

const log = createLogger('ingest-pharmacies');

export type { EmergencyPharmacy };

const PHARMACY_TIMEOUT_MS = 15_000;

/**
 * aponet.de JSON endpoint (TYPO3-based).
 * The token is a public widget token used by the MagicMirror community module.
 * If aponet.de revokes it, set APONET_TOKEN env var with a fresh one.
 */
const APONET_TOKEN = process.env.APONET_TOKEN ?? '216823d96ea25c051509d935955c130fbc72680fc1d3040fe3e8ca0e25f9cd02';

interface AponetPharmacy {
  name: string;
  strasse: string;
  plz: string;
  ort: string;
  telefon?: string;
  distanz?: string;
  startdatum: string;
  enddatum: string;
  startzeit: string;
  endzeit: string;
  latitude?: string;
  longitude?: string;
}

export function createPharmacyIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestPharmacies(): Promise<void> {
    const cities = getActiveCities();
    for (const city of cities) {
      if (city.country !== 'DE') continue;
      try {
        await ingestCityPharmacies(city, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

function formatDateDE(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

async function ingestCityPharmacies(city: CityConfig, cache: Cache, db: Db | null): Promise<void> {
  const { lat, lon } = city.coordinates;
  const today = formatDateDE(new Date());

  const params = new URLSearchParams({
    'tx_aponetpharmacy_search[action]': 'result',
    'tx_aponetpharmacy_search[controller]': 'Search',
    'tx_aponetpharmacy_search[search][plzort]': '',
    'tx_aponetpharmacy_search[search][date]': today,
    'tx_aponetpharmacy_search[search][street]': '',
    'tx_aponetpharmacy_search[search][radius]': '25',
    'tx_aponetpharmacy_search[search][lat]': lat.toString(),
    'tx_aponetpharmacy_search[search][lng]': lon.toString(),
    'tx_aponetpharmacy_search[token]': APONET_TOKEN,
    'type': '1981',
  });

  const url = `https://www.aponet.de/apotheke/notdienstsuche?${params.toString()}`;

  const response = await log.fetch(url, {
    signal: AbortSignal.timeout(PHARMACY_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });

  if (!response.ok) {
    log.warn(`${city.id}: aponet.de returned ${response.status}`);
    return;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    log.warn(`${city.id}: aponet.de returned non-JSON (${contentType})`);
    return;
  }

  const data = await response.json() as {
    results?: { apotheken?: { apotheke?: AponetPharmacy[] } };
  };

  const raw = data?.results?.apotheken?.apotheke ?? [];
  const pharmacies = raw
    .filter((p) => p.latitude && p.longitude)
    .map((p, i): EmergencyPharmacy => ({
      id: `apo-${city.id}-${i}`,
      name: p.name,
      address: `${p.strasse}, ${p.plz} ${p.ort}`,
      phone: p.telefon || undefined,
      location: { lat: parseFloat(p.latitude!), lon: parseFloat(p.longitude!) },
      validFrom: parseDateTimeDE(p.startdatum, p.startzeit),
      validUntil: parseDateTimeDE(p.enddatum, p.endzeit),
      distance: p.distanz ? parseFloat(p.distanz) : undefined,
    }));

  cache.set(CK.pharmacies(city.id), pharmacies, 21600);

  if (db) {
    try {
      await savePharmacies(db, city.id, pharmacies);
    } catch (err) {
      log.error(`${city.id} DB write failed`, err);
    }
  }

  log.info(`${city.id}: ${pharmacies.length} emergency pharmacies updated`);
}

/** Parse "DD.MM.YYYY" + "HH:MM" into ISO string */
function parseDateTimeDE(date: string, time: string): string {
  const [d, m, y] = date.split('.');
  return `${y}-${m}-${d}T${time || '00:00'}:00`;
}
