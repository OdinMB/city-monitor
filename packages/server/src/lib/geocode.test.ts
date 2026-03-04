import { describe, it, expect, vi, beforeEach } from 'vitest';

// Stub env before importing geocode
vi.stubEnv('LOCATIONIQ_TOKEN', '');

// Mock DB modules before importing geocode
vi.mock('../db/reads.js', () => ({
  loadGeocodeLookup: vi.fn().mockResolvedValue(null),
}));
vi.mock('../db/writes.js', () => ({
  saveGeocodeLookup: vi.fn().mockResolvedValue(undefined),
}));

import { geocode, clearGeocodeCache, initGeocodeDb } from './geocode.js';
import { loadGeocodeLookup } from '../db/reads.js';
import { saveGeocodeLookup } from '../db/writes.js';
import type { Db } from '../db/index.js';

const mockDb = {} as Db;

const NOMINATIM_RESPONSE = [
  { lat: '52.5219184', lon: '13.4132147', display_name: 'Alexanderplatz, Mitte, Berlin' },
];

const EXPECTED_RESULT = {
  lat: 52.5219184,
  lon: 13.4132147,
  displayName: 'Alexanderplatz, Mitte, Berlin',
};

function mockOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('geocode (Nominatim only — no LOCATIONIQ_TOKEN)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearGeocodeCache();
  });

  it('returns coordinates from Nominatim response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockOk(NOMINATIM_RESPONSE));

    const result = await geocode('Alexanderplatz', 'Berlin');
    expect(result).toEqual(EXPECTED_RESULT);

    const url = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(url).toContain('nominatim.openstreetmap.org');
  });

  it('returns null when no results found', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockOk([]));

    const result = await geocode('Nonexistent Place XYZ', 'Berlin');
    expect(result).toBeNull();
  });

  it('returns null on HTTP error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Too Many Requests', { status: 429 }),
    );

    const result = await geocode('Alexanderplatz', 'Berlin');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const result = await geocode('Alexanderplatz', 'Berlin');
    expect(result).toBeNull();
  });
});

describe('geocode in-process cache', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearGeocodeCache();
  });

  it('returns cached result on second call without fetching', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockOk(NOMINATIM_RESPONSE));

    const first = await geocode('Alexanderplatz', 'Berlin');
    expect(first).toEqual(EXPECTED_RESULT);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call — same query — should not fetch
    const second = await geocode('Alexanderplatz', 'Berlin');
    expect(second).toEqual(EXPECTED_RESULT);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('caches null results (negative caching)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockOk([]));

    const first = await geocode('Nonexistent XYZ', 'Berlin');
    expect(first).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call — should return null from cache, no fetch
    const second = await geocode('Nonexistent XYZ', 'Berlin');
    expect(second).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('cache key is case-insensitive', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockOk(NOMINATIM_RESPONSE));

    await geocode('Alexanderplatz', 'Berlin');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Different casing — should still hit cache
    const result = await geocode('alexanderplatz', 'berlin');
    expect(result).toEqual(EXPECTED_RESULT);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('clearGeocodeCache resets the cache', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockOk(NOMINATIM_RESPONSE))
      .mockResolvedValueOnce(mockOk(NOMINATIM_RESPONSE));

    await geocode('Alexanderplatz', 'Berlin');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    clearGeocodeCache();

    // After clear, should fetch again
    await geocode('Alexanderplatz', 'Berlin');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('geocode DB layer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearGeocodeCache();
    vi.mocked(loadGeocodeLookup).mockResolvedValue(null);
    vi.mocked(saveGeocodeLookup).mockResolvedValue(undefined);
    initGeocodeDb(mockDb);
  });

  it('returns result from DB when Map misses', async () => {
    vi.mocked(loadGeocodeLookup).mockResolvedValueOnce({
      lat: 52.5219184,
      lon: 13.4132147,
      displayName: 'Alexanderplatz, Mitte, Berlin',
      provider: 'nominatim',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await geocode('Alexanderplatz', 'Berlin');

    expect(result).toEqual(EXPECTED_RESULT);
    expect(loadGeocodeLookup).toHaveBeenCalledWith(mockDb, 'alexanderplatz, berlin');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('populates in-process Map after DB hit', async () => {
    vi.mocked(loadGeocodeLookup).mockResolvedValueOnce({
      lat: 52.5219184,
      lon: 13.4132147,
      displayName: 'Alexanderplatz, Mitte, Berlin',
      provider: 'nominatim',
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await geocode('Alexanderplatz', 'Berlin');

    // Second call — should hit in-process Map, no DB or fetch
    vi.mocked(loadGeocodeLookup).mockClear();
    const result = await geocode('Alexanderplatz', 'Berlin');

    expect(result).toEqual(EXPECTED_RESULT);
    expect(loadGeocodeLookup).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('writes to DB after successful API call', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockOk(NOMINATIM_RESPONSE));

    await geocode('Alexanderplatz', 'Berlin');

    // saveGeocodeLookup is called fire-and-forget, flush microtasks
    await new Promise((r) => setTimeout(r, 0));

    expect(saveGeocodeLookup).toHaveBeenCalledWith(
      mockDb,
      'alexanderplatz, berlin',
      EXPECTED_RESULT,
      'nominatim',
    );
  });

  it('does not write to DB for null API results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockOk([]));

    await geocode('Nonexistent XYZ', 'Berlin');
    await new Promise((r) => setTimeout(r, 0));

    expect(saveGeocodeLookup).not.toHaveBeenCalled();
  });
});
