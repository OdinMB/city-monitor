/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import type { WaterLevelData } from '@city-monitor/shared';

// Mock PEGELONLINE API response matching real shape
const mockPegelonlineResponse = [
  {
    uuid: '09e15cf6-f155-4b76-b92f-6c260839121c',
    shortname: 'BERLIN-MÜHLENDAMM UP',
    longitude: 13.40869,
    latitude: 52.514897,
    water: { shortname: 'SOW', longname: 'SPREE-ODER-WASSERSTRASSE' },
    timeseries: [
      {
        shortname: 'W',
        unit: 'cm',
        currentMeasurement: {
          timestamp: '2026-03-03T01:30:00+01:00',
          value: 278.0,
          stateMnwMhw: 'normal',
          stateNswHsw: 'unknown',
        },
        characteristicValues: [
          { shortname: 'MNW', value: 272.0 },
          { shortname: 'MW', value: 279.0 },
          { shortname: 'MHW', value: 311.0 },
          { shortname: 'HHW', value: 436.0 },
          { shortname: 'NNW', value: 217.0 },
        ],
      },
    ],
  },
  {
    uuid: 'd89eb759-58c4-43f4-9fe4-e6a21af23f5c',
    shortname: 'BERLIN-CHARLOTTENBURG UP',
    longitude: 13.282545,
    latitude: 52.530037,
    water: { shortname: 'SOW', longname: 'SPREE-ODER-WASSERSTRASSE' },
    timeseries: [
      {
        shortname: 'W',
        unit: 'cm',
        currentMeasurement: {
          timestamp: '2026-03-03T01:30:00+01:00',
          value: 200.0,
          stateMnwMhw: 'high',
          stateNswHsw: 'unknown',
        },
        characteristicValues: [
          { shortname: 'MNW', value: 123.0 },
          { shortname: 'MW', value: 147.0 },
          { shortname: 'MHW', value: 209.0 },
          { shortname: 'HHW', value: 326.0 },
        ],
      },
    ],
  },
];

describe('ingest-water-levels', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches water levels from PEGELONLINE and writes to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockPegelonlineResponse), { status: 200 }),
    );

    const cache = createCache();
    const { createWaterLevelIngestion } = await import('./ingest-water-levels.js');
    const ingest = createWaterLevelIngestion(cache);
    await ingest();

    const data = cache.get<WaterLevelData>('berlin:water-levels');
    expect(data).toBeTruthy();
    expect(data!.stations).toHaveLength(2);
    expect(data!.fetchedAt).toBeTruthy();
  });

  it('transforms PEGELONLINE response into WaterLevelStation shape', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockPegelonlineResponse), { status: 200 }),
    );

    const cache = createCache();
    const { createWaterLevelIngestion } = await import('./ingest-water-levels.js');
    const ingest = createWaterLevelIngestion(cache);
    await ingest();

    const data = cache.get<WaterLevelData>('berlin:water-levels')!;
    const station = data.stations[0];

    expect(station.uuid).toBe('09e15cf6-f155-4b76-b92f-6c260839121c');
    expect(station.name).toBe('Mühlendamm');
    expect(station.waterBody).toBe('Spree');
    expect(station.lat).toBe(52.514897);
    expect(station.lon).toBe(13.40869);
    expect(station.currentLevel).toBe(278.0);
    expect(station.timestamp).toBe('2026-03-03T01:30:00+01:00');
    expect(station.state).toBe('normal');
    expect(station.tidal).toBe(false);
    expect(station.characteristicValues).toEqual([
      { shortname: 'MNW', value: 272.0 },
      { shortname: 'MW', value: 279.0 },
      { shortname: 'MHW', value: 311.0 },
      { shortname: 'HHW', value: 436.0 },
      { shortname: 'NNW', value: 217.0 },
    ]);
  });

  it('maps stateMnwMhw "high" correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockPegelonlineResponse), { status: 200 }),
    );

    const cache = createCache();
    const { createWaterLevelIngestion } = await import('./ingest-water-levels.js');
    const ingest = createWaterLevelIngestion(cache);
    await ingest();

    const data = cache.get<WaterLevelData>('berlin:water-levels')!;
    expect(data.stations[1].state).toBe('high');
  });

  it('derives very_high when current exceeds MHW', async () => {
    const stationAboveMhw = [{
      ...mockPegelonlineResponse[0],
      timeseries: [{
        shortname: 'W',
        unit: 'cm',
        currentMeasurement: {
          timestamp: '2026-03-03T01:30:00+01:00',
          value: 450.0,
          stateMnwMhw: 'high',
          stateNswHsw: 'unknown',
        },
        characteristicValues: [
          { shortname: 'MHW', value: 311.0 },
          { shortname: 'HHW', value: 436.0 },
        ],
      }],
    }];

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(stationAboveMhw), { status: 200 }),
    );

    const cache = createCache();
    const { createWaterLevelIngestion } = await import('./ingest-water-levels.js');
    const ingest = createWaterLevelIngestion(cache);
    await ingest();

    const data = cache.get<WaterLevelData>('berlin:water-levels')!;
    expect(data.stations[0].state).toBe('very_high');
  });

  it('handles API failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const { createWaterLevelIngestion } = await import('./ingest-water-levels.js');
    const ingest = createWaterLevelIngestion(cache);
    await ingest(); // should not throw

    const data = cache.get<WaterLevelData>('berlin:water-levels');
    expect(data).toBeNull();
  });

  it('constructs correct API URL with station UUIDs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const cache = createCache();
    const { createWaterLevelIngestion } = await import('./ingest-water-levels.js');
    const ingest = createWaterLevelIngestion(cache);
    await ingest();

    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('pegelonline.wsv.de');
    expect(url).toContain('includeTimeseries=true');
    expect(url).toContain('includeCurrentMeasurement=true');
    expect(url).toContain('includeCharacteristicValues=true');
  });

  it('uses station name from city config, not API shortname', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(mockPegelonlineResponse), { status: 200 }),
    );

    const cache = createCache();
    const { createWaterLevelIngestion } = await import('./ingest-water-levels.js');
    const ingest = createWaterLevelIngestion(cache);
    await ingest();

    const data = cache.get<WaterLevelData>('berlin:water-levels')!;
    // Config says "Mühlendamm", API says "BERLIN-MÜHLENDAMM UP"
    expect(data.stations[0].name).toBe('Mühlendamm');
  });
});
