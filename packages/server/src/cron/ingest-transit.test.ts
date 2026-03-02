/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createTransitIngestion, type TransitAlert } from './ingest-transit.js';

const mockDeparturesResponse = {
  departures: [
    {
      line: { name: 'U2', product: 'subway' },
      stop: {
        name: 'S+U Alexanderplatz Bhf',
        location: { latitude: 52.521508, longitude: 13.411267 },
      },
      remarks: [
        {
          type: 'warning',
          summary: 'U2: Störung zwischen Alexanderplatz und Ruhleben',
          text: 'Wegen einer Signalstörung zwischen Alexanderplatz und Ruhleben kommt es zu Verspätungen von ca. 10 Minuten.',
        },
      ],
    },
    {
      line: { name: 'S1', product: 'suburban' },
      stop: {
        name: 'S+U Friedrichstraße Bhf',
        location: { latitude: 52.520277, longitude: 13.386943 },
      },
      remarks: [
        {
          type: 'warning',
          summary: 'S1: Sperrung Oranienburg – Birkenwerder',
          text: 'Aufgrund von Bauarbeiten gesperrt bis 06:00. Bitte nutzen Sie den Ersatzverkehr mit Bussen.',
        },
      ],
    },
    {
      // Duplicate U2 warning — should be deduped
      line: { name: 'U2', product: 'subway' },
      stop: {
        name: 'S+U Alexanderplatz Bhf',
        location: { latitude: 52.521508, longitude: 13.411267 },
      },
      remarks: [
        {
          type: 'warning',
          summary: 'U2: Störung zwischen Alexanderplatz und Ruhleben',
          text: 'Wegen einer Signalstörung zwischen Alexanderplatz und Ruhleben kommt es zu Verspätungen von ca. 10 Minuten.',
        },
      ],
    },
    {
      // Elevator disruption with detailed text
      line: { name: 'U8', product: 'subway' },
      stop: {
        name: 'S+U Alexanderplatz Bhf',
        location: { latitude: 52.521508, longitude: 13.411267 },
      },
      remarks: [
        {
          type: 'warning',
          summary: 'Aufzug außer Betrieb',
          text: 'Der Aufzug am S+U Alexanderplatz (Straße <> Bahnsteig U2 <> Zwischenebene <> Bahnsteig U5 Richtung Hönow) wird in Kürze repariert.',
        },
      ],
    },
  ],
};

/** Run an async function to completion with fake timers */
async function runWithFakeTimers(fn: () => Promise<void>): Promise<void> {
  const promise = fn();
  // Advance through all inter-station delays (12 stations × 1.5s)
  for (let i = 0; i < 15; i++) {
    await vi.advanceTimersByTimeAsync(2000);
  }
  await promise;
}

describe('ingest-transit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fetches transit disruptions and writes to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts');
    expect(alerts).toBeTruthy();
    expect(alerts!.length).toBeGreaterThanOrEqual(1);
  });

  it('captures station name and location from departure stop', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    const u2Alert = alerts.find((a) => a.line === 'U2');
    expect(u2Alert).toBeTruthy();
    expect(u2Alert!.station).toBeTruthy();
    expect(u2Alert!.location).toEqual({ lat: 52.521508, lon: 13.411267 });
  });

  it('captures detailed remark text in the detail field', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    const elevator = alerts.find((a) => a.message.includes('Aufzug'));
    expect(elevator).toBeTruthy();
    expect(elevator!.detail).toContain('Alexanderplatz');
    expect(elevator!.detail).toContain('Bahnsteig U2');
    // detail should differ from message (summary)
    expect(elevator!.detail).not.toBe(elevator!.message);
  });

  it('deduplicates disruptions from multiple departures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockDeparturesResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

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
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts');
    expect(alerts).toBeNull();
  });

  it('falls back to summary when remark text is empty', async () => {
    const noTextResponse = {
      departures: [
        {
          line: { name: 'U5', product: 'subway' },
          stop: { name: 'S+U Alexanderplatz Bhf', location: { latitude: 52.52, longitude: 13.41 } },
          remarks: [
            { type: 'warning', summary: 'Störung auf der U5', text: '' },
          ],
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(noTextResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].detail).toBe(alerts[0].message);
  });

  it('extracts stops from em-dash range pattern', async () => {
    const dashResponse = {
      departures: [
        {
          line: { name: 'S1', product: 'suburban' },
          stop: { name: 'Test Station', location: { latitude: 52.52, longitude: 13.41 } },
          remarks: [
            { type: 'warning', summary: 'S1: Sperrung Oranienburg – Birkenwerder', text: '' },
          ],
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(dashResponse), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createTransitIngestion(cache);
    await runWithFakeTimers(ingest);

    const alerts = cache.get<TransitAlert[]>('berlin:transit:alerts')!;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].affectedStops).toHaveLength(2);
    expect(alerts[0].affectedStops[1]).toBe('Birkenwerder');
  });
});
