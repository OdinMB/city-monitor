/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createEventsIngestion, type CityEvent } from './ingest-events.js';

const mockKulturdatenResponse = {
  success: true,
  data: {
    page: 1,
    pageSize: 50,
    totalCount: 2,
    events: [
      {
        identifier: 'E_ABC123',
        status: 'event.published',
        schedule: { startDate: '2026-03-05', startTime: '19:00:00' },
        attractions: [{ referenceLabel: { de: 'Berliner Philharmoniker – Konzert' } }],
        locations: [{ referenceLabel: { de: 'Philharmonie' } }],
        admission: { ticketType: 'ticketType.paid' },
      },
      {
        identifier: 'E_DEF456',
        status: 'event.published',
        schedule: { startDate: '2026-03-06', startTime: '17:00:00' },
        attractions: [{ referenceLabel: { de: 'Street Food Thursday' } }],
        locations: [{ referenceLabel: { de: 'Markthalle Neun' } }],
        admission: { ticketType: 'ticketType.freeOfCharge' },
      },
      {
        identifier: 'E_DRAFT',
        status: 'event.draft',
        schedule: { startDate: '2026-03-07' },
        attractions: [{ referenceLabel: { de: 'Unpublished Event' } }],
        locations: [],
        admission: {},
      },
    ],
  },
};

describe('ingest-events', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches events from kulturdaten.berlin and writes to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockKulturdatenResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createEventsIngestion(cache);
    await ingest();

    const events = cache.get<CityEvent[]>('berlin:events:upcoming');
    expect(events).toBeTruthy();
    expect(events!.length).toBe(2); // draft event filtered out
    expect(events![0].title).toContain('Philharmoniker');
    expect(events![0].venue).toBe('Philharmonie');
  });

  it('classifies event categories from title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockKulturdatenResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createEventsIngestion(cache);
    await ingest();

    const events = cache.get<CityEvent[]>('berlin:events:upcoming')!;
    const concert = events.find((e) => e.title.includes('Konzert'));
    expect(concert?.category).toBe('music');

    const foodEvent = events.find((e) => e.title.includes('Food'));
    expect(foodEvent?.category).toBe('food');
    expect(foodEvent?.free).toBe(true);
  });

  it('handles API failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createEventsIngestion(cache);
    await ingest(); // should not throw

    const events = cache.get<CityEvent[]>('berlin:events:upcoming');
    expect(events).toBeNull();
  });
});
