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
const APONET_SEARCH_URL = 'https://www.aponet.de/apotheke/notdienstsuche';
const APONET_BASE_URL = 'https://www.aponet.de';

/** Central PLZ per city — the form requires a PLZ, not lat/lng coordinates. */
const CITY_PLZ: Record<string, string> = {
  berlin: '10115',
  hamburg: '20095',
  koeln: '50667',
};

// ---------------------------------------------------------------------------
// Form token extraction
// ---------------------------------------------------------------------------

export interface FormTokens {
  actionPath: string;
  hiddenFields: Record<string, string>;
}

/**
 * Extract TYPO3 form tokens (cHash + hidden __referrer / __trustedProperties
 * fields) from the aponet.de search page HTML.
 */
export function extractFormTokens(html: string): FormTokens | null {
  // Extract full form action path (contains cHash and TYPO3 action/controller params)
  const actionMatch = /id="pharmacy-searchform"[^>]*action="([^"]*)"/.exec(html);
  if (!actionMatch) return null;

  // Decode HTML entities in action URL (&amp; -> &)
  const actionPath = actionMatch[1].replace(/&amp;/g, '&');

  // Extract all hidden input fields whose names start with tx_aponetpharmacy_search[__
  const hiddenFields: Record<string, string> = {};
  const hiddenRe = /<input\s+type="hidden"\s+name="(tx_aponetpharmacy_search\[__[^"]+)"\s+value="([^"]*)"\s*\/?>/g;
  let match = hiddenRe.exec(html);
  while (match) {
    // Decode HTML entities in value (&quot; -> ")
    const value = match[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    hiddenFields[match[1]] = value;
    match = hiddenRe.exec(html);
  }

  if (Object.keys(hiddenFields).length === 0) return null;

  return { actionPath, hiddenFields };
}

// ---------------------------------------------------------------------------
// HTML pharmacy parser
// ---------------------------------------------------------------------------

/**
 * Parse emergency pharmacy entries from aponet.de HTML search results.
 * Uses regex to extract data from `<li class="list-group-item">` elements.
 */
export function parsePharmaciesFromHtml(html: string, cityId: string): EmergencyPharmacy[] {
  const items = html.match(/<li\s+class="list-group-item[\s\S]*?(?=<li\s|<\/ul>|$)/g);
  if (!items) return [];

  const pharmacies: EmergencyPharmacy[] = [];

  for (const item of items) {
    // Lat/lon from data attributes (required)
    const latMatch = /data-latitude="([^"]+)"/.exec(item);
    const lonMatch = /data-longitude="([^"]+)"/.exec(item);
    if (!latMatch || !lonMatch) continue;

    // Name
    const nameMatch = /<h2[^>]*class="name"[^>]*>(.*?)<\/h2>/.exec(item);
    const name = nameMatch ? nameMatch[1].trim() : 'Unknown';

    // Address
    const streetMatch = /class="strasse">(.*?)<\/span>/.exec(item);
    const plzMatch = /class="plz">(.*?)<\/span>/.exec(item);
    const ortMatch = /class="ort">(.*?)<\/span>/.exec(item);
    const street = streetMatch ? streetMatch[1].trim() : '';
    const plz = plzMatch ? plzMatch[1].trim() : '';
    const ort = ortMatch ? ortMatch[1].trim() : '';
    const address = `${street}, ${plz} ${ort}`;

    // Phone (optional)
    const phoneMatch = /href="tel:([^"]+)"/.exec(item);
    const phone = phoneMatch ? phoneMatch[1].trim() : undefined;

    // Validity period
    const validityMatch = /Notdienst vom (\d{2}\.\d{2}\.\d{4}) um (\d{2}:\d{2}) Uhr bis (\d{2}\.\d{2}\.\d{4}) um (\d{2}:\d{2}) Uhr/.exec(item);
    const validFrom = validityMatch ? parseDateTimeDE(validityMatch[1], validityMatch[2]) : '';
    const validUntil = validityMatch ? parseDateTimeDE(validityMatch[3], validityMatch[4]) : '';

    // Distance (optional)
    const distanceMatch = /(\d+[.,]\d+)\s*km/.exec(item);
    const distance = distanceMatch ? parseFloat(distanceMatch[1].replace(',', '.')) : undefined;

    pharmacies.push({
      id: `apo-${cityId}-${pharmacies.length}`,
      name,
      address,
      phone,
      location: { lat: parseFloat(latMatch[1]), lon: parseFloat(lonMatch[1]) },
      validFrom,
      validUntil,
      distance,
    });
  }

  return pharmacies;
}

// ---------------------------------------------------------------------------
// Ingestion entry point
// ---------------------------------------------------------------------------

export function createPharmacyIngestion(cache: Cache, db: Db | null = null) {
  return async function ingestPharmacies(): Promise<void> {
    // Fetch form tokens once — they are site-wide, not city-specific
    const tokens = await fetchFormTokens();
    if (!tokens) return;

    const cities = getActiveCities();
    for (const city of cities) {
      if (city.country !== 'DE') continue;
      try {
        await ingestCityPharmacies(city, tokens, cache, db);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

export function formatDateDE(date: Date): string {
  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

async function fetchFormTokens(): Promise<FormTokens | null> {
  const response = await log.fetch(APONET_SEARCH_URL, {
    signal: AbortSignal.timeout(PHARMACY_TIMEOUT_MS),
    headers: { 'User-Agent': 'CityMonitor/1.0' },
  });
  if (!response.ok) {
    log.warn(`aponet.de search page returned ${response.status}`);
    return null;
  }
  const html = await response.text();
  const tokens = extractFormTokens(html);
  if (!tokens) {
    log.warn('could not extract form tokens from aponet.de');
  }
  return tokens;
}

async function ingestCityPharmacies(city: CityConfig, tokens: FormTokens, cache: Cache, db: Db | null): Promise<void> {
  const plz = CITY_PLZ[city.id];
  if (!plz) {
    log.warn(`${city.id}: no PLZ configured for pharmacy search`);
    return;
  }
  const today = formatDateDE(new Date());

  const formData = new URLSearchParams({
    ...tokens.hiddenFields,
    'tx_aponetpharmacy_search[search][plzort]': plz,
    'tx_aponetpharmacy_search[search][date]': today,
    'tx_aponetpharmacy_search[search][street]': '',
    'tx_aponetpharmacy_search[search][radius]': '25',
  });

  const resultUrl = `${APONET_BASE_URL}${tokens.actionPath}`;
  const resultResponse = await log.fetch(resultUrl, {
    method: 'POST',
    body: formData.toString(),
    signal: AbortSignal.timeout(PHARMACY_TIMEOUT_MS),
    headers: {
      'User-Agent': 'CityMonitor/1.0',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  if (!resultResponse.ok) {
    log.warn(`${city.id}: aponet.de results returned ${resultResponse.status}`);
    return;
  }

  const resultHtml = await resultResponse.text();
  const pharmacies = parsePharmaciesFromHtml(resultHtml, city.id);

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
export function parseDateTimeDE(date: string, time: string): string {
  const [d, m, y] = date.split('.');
  return `${y}-${m}-${d}T${time || '00:00'}:00`;
}
