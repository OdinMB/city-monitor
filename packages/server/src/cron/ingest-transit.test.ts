/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createTransitIngestion, type TransitAlert } from './ingest-transit.js';

const mockDeparturesResponse = {
  departures: [
    {
      line: { name: 'U2', product: 'subway' },
      remarks: [
        { type: 'warning', summary: 'U2: Störung zwischen Alexanderplatz und Ruhleben', text: 'Wegen einer Signalstörung kommt es zu Verspätungen.' },
      ],
    },
    {
      line: { name: 'S1', product: 'suburban' },
      remarks: [
        { type: 'warning', summary: 'S1: Sperrung Oranienburg – Birkenwerder', text: 'Aufgrund von Bauarbeiten gesperrt bis 06:00.' },
      ],
    },
    {
      line: { name: 'U2', product: 'subway' },
      remarks: [
        { type: 'warning', summary: 'U2: Störung zwischen Alexanderplatz und Ruhleben', text: 'Wegen einer Signalstörung kommt es zu Verspätungen.' },
      ],
    },
  ],
};

describe('ingest-transit', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches transit disruptions and writes to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await ingest();

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts');
    expect(alerts).toBeTruthy();
    expect(alerts!.length).toBeGreaterThanOrEqual(1);
  });

  it('deduplicates disruptions from multiple departures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await ingest();

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    // U2 disruption appears twice in mock data but should be deduped
    const u2Alerts = alerts.filter((a) => a.line === 'U2');
    expect(u2Alerts).toHaveLength(1);
  });

  it('handles API failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await ingest(); // should not throw

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts');
    expect(alerts).toBeNull();
  });
});
