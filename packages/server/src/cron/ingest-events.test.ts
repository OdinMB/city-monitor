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

const mockTicketmasterResponse = {
  _embedded: {
    events: [
      {
        id: 'TM_001',
        name: 'Rock Concert Berlin',
        url: 'https://ticketmaster.com/event/TM_001',
        dates: { start: { localDate: '2026-03-07', localTime: '20:00:00' } },
        classifications: [{ segment: { name: 'Music' } }],
        priceRanges: [{ min: 29, max: 89, currency: 'EUR' }],
        _embedded: { venues: [{ name: 'Mercedes-Benz Arena' }] },
      },
    ],
  },
};

const mockGomusResponse = {
  events: [
    {
      id: 42,
      title: 'Pergamon – Das Panorama',
      sub_title: 'Führung',
      description: '<p>A guided tour through the exhibition.</p>',
      entry_fee: true,
      upcoming_bookings_start_times: ['2026-03-08T14:00:00Z'],
      location: { name: 'Pergamonmuseum', address: 'Bodestraße 1-3' },
    },
  ],
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
    expect(events![0].source).toBe('kulturdaten');
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

  it('fetches Ticketmaster events when API key is set', async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('ticketmaster.com')) {
        return new Response(JSON.stringify(mockTicketmasterResponse), { status: 200 });
      }
      // Return empty for kulturdaten and gomus
      return new Response(JSON.stringify({ success: true, data: { events: [] } }), { status: 200 });
    });

    const cache = createCache();
    const ingest = createEventsIngestion(cache);
    await ingest();

    const events = cache.get<CityEvent[]>('berlin:events:upcoming');
    expect(events).toBeTruthy();
    const tmEvent = events!.find((e) => e.source === 'ticketmaster');
    expect(tmEvent).toBeTruthy();
    expect(tmEvent!.title).toBe('Rock Concert Berlin');
    expect(tmEvent!.venue).toBe('Mercedes-Benz Arena');
    expect(tmEvent!.category).toBe('music');
    expect(tmEvent!.price).toBe('29–89 EUR');

    delete process.env.TICKETMASTER_CONSUMER_KEY;
  });

  it('skips Ticketmaster when API key is absent', async () => {
    delete process.env.TICKETMASTER_CONSUMER_KEY;

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { events: [] } }), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createEventsIngestion(cache);
    await ingest();

    // Should not have called Ticketmaster
    const calls = fetchSpy.mock.calls.map(([input]) =>
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
    );
    expect(calls.some((u) => u.includes('ticketmaster.com'))).toBe(false);
  });

  it('fetches go~mus events', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('gomus.de')) {
        return new Response(JSON.stringify(mockGomusResponse), { status: 200 });
      }
      return new Response(JSON.stringify({ success: true, data: { events: [] } }), { status: 200 });
    });

    const cache = createCache();
    const ingest = createEventsIngestion(cache);
    await ingest();

    const events = cache.get<CityEvent[]>('berlin:events:upcoming');
    expect(events).toBeTruthy();
    const gomusEvent = events!.find((e) => e.source === 'gomus');
    expect(gomusEvent).toBeTruthy();
    expect(gomusEvent!.title).toContain('Pergamon');
    expect(gomusEvent!.venue).toBe('Pergamonmuseum');
    expect(gomusEvent!.description).toContain('guided tour');
  });

  it('merges events from multiple sources sorted by date', async () => {
    process.env.TICKETMASTER_CONSUMER_KEY = 'test-key';

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('kulturdaten.berlin')) {
        return new Response(JSON.stringify(mockKulturdatenResponse), { status: 200 });
      }
      if (url.includes('ticketmaster.com')) {
        return new Response(JSON.stringify(mockTicketmasterResponse), { status: 200 });
      }
      if (url.includes('gomus.de')) {
        return new Response(JSON.stringify(mockGomusResponse), { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const cache = createCache();
    const ingest = createEventsIngestion(cache);
    await ingest();

    const events = cache.get<CityEvent[]>('berlin:events:upcoming')!;
    expect(events.length).toBeGreaterThanOrEqual(3);

    // Verify sorted by date
    for (let i = 1; i < events.length; i++) {
      expect(events[i].date >= events[i - 1].date).toBe(true);
    }

    // Verify sources present
    const sources = new Set(events.map((e) => e.source));
    expect(sources.has('kulturdaten')).toBe(true);
    expect(sources.has('ticketmaster')).toBe(true);
    expect(sources.has('gomus')).toBe(true);

    delete process.env.TICKETMASTER_CONSUMER_KEY;
  });
});
