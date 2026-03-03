/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { BuergeramtData, BuergeramtService } from '@city-monitor/shared';
import type { Cache } from '../lib/cache.js';
import { getActiveCities } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

export type { BuergeramtData };

const log = createLogger('ingest-appointments');

const FIRECRAWL_URL = 'https://api.firecrawl.dev/v2/scrape';
const SERVICE_BERLIN_BASE = 'https://service.berlin.de/terminvereinbarung/termin/all';
const BOOKING_URL = 'https://service.berlin.de/terminvereinbarung/';
const SCRAPE_TIMEOUT_MS = 30_000;
const INTER_SERVICE_DELAY_MS = 2_000;

/**
 * Parse available appointment dates from service.berlin.de calendar HTML.
 * Two-step approach: first extract each td.buchbar block, then find /time/{unix}/ hrefs inside.
 * Returns sorted unique ISO date strings (YYYY-MM-DD).
 */
export function parseAppointmentDates(html: string): string[] {
  const tdRegex = /<td[^>]*class="[^"]*buchbar[^"]*"[^>]*>([\s\S]*?)<\/td>/g;
  const hrefRegex = /\/time\/(\d{10,})\//;
  const dateSet = new Set<string>();

  let tdMatch;
  while ((tdMatch = tdRegex.exec(html)) !== null) {
    const inner = tdMatch[1];
    const hrefMatch = hrefRegex.exec(inner);
    if (hrefMatch) {
      const ts = parseInt(hrefMatch[1], 10);
      const date = new Date(ts * 1000);
      dateSet.add(date.toISOString().split('T')[0]);
    }
  }

  return [...dateSet].sort();
}

/**
 * Derive appointment availability status from the count of available days.
 */
export function deriveStatus(availableDays: number): BuergeramtService['status'] {
  if (availableDays >= 5) return 'available';
  if (availableDays >= 1) return 'scarce';
  return 'none';
}

async function scrapeService(
  serviceId: string,
  apiKey: string,
): Promise<string | null> {
  const url = `${SERVICE_BERLIN_BASE}/${serviceId}/`;

  const response = await log.fetch(FIRECRAWL_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['html'],
      waitFor: 5000,
      timeout: 20000,
    }),
  });

  if (!response.ok) {
    log.warn(`Firecrawl returned ${response.status} for service ${serviceId}`);
    return null;
  }

  const data = await response.json() as { success?: boolean; data?: { html?: string } };
  if (!data.success || !data.data?.html) {
    log.warn(`Firecrawl returned no HTML for service ${serviceId}`);
    return null;
  }

  return data.data.html;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createAppointmentIngestion(cache: Cache) {
  return async function ingestAppointments(): Promise<void> {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      log.warn('FIRECRAWL_API_KEY not set — skipping appointment ingestion');
      return;
    }

    const cities = getActiveCities();
    for (const city of cities) {
      const config = city.dataSources.appointments;
      if (!config) continue;

      try {
        await ingestCityAppointments(city.id, config.services, apiKey, cache);
      } catch (err) {
        log.error(`${city.id} failed`, err);
      }
    }
  };
}

async function ingestCityAppointments(
  cityId: string,
  services: Array<{ id: string; name: string }>,
  apiKey: string,
  cache: Cache,
): Promise<void> {
  const results: BuergeramtService[] = [];

  for (let i = 0; i < services.length; i++) {
    const svc = services[i];

    const html = await scrapeService(svc.id, apiKey);
    if (!html) {
      results.push({
        serviceId: svc.id,
        name: svc.name,
        earliestDate: null,
        availableDays: 0,
        status: 'unknown',
      });
      continue;
    }

    const dates = parseAppointmentDates(html);
    results.push({
      serviceId: svc.id,
      name: svc.name,
      earliestDate: dates[0] ?? null,
      availableDays: dates.length,
      status: deriveStatus(dates.length),
    });

    log.info(`${cityId}: ${svc.name} — ${dates.length} days available`);

    // Small delay between services to avoid overwhelming Firecrawl
    if (i < services.length - 1) {
      await sleep(INTER_SERVICE_DELAY_MS);
    }
  }

  const data: BuergeramtData = {
    services: results,
    fetchedAt: new Date().toISOString(),
    bookingUrl: BOOKING_URL,
  };

  cache.set(`${cityId}:appointments`, data, 21600); // 6h TTL
  log.info(`${cityId}: ${results.length} services updated`);
}
