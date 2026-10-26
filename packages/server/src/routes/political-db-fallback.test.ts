import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { Server } from 'node:http';
import express from 'express';
import { createCache } from '../lib/cache.js';
import { createPoliticalRouter } from './political.js';
import type { PoliticalDistrict } from '@city-monitor/shared';

vi.mock('../db/reads.js', () => ({
  loadPoliticalDistricts: vi.fn(),
}));

import { loadPoliticalDistricts } from '../db/reads.js';

const WEEK_MS = 604800 * 1000;

const storedDistricts: PoliticalDistrict[] = [
  {
    id: 'bundestag-berlin-mitte',
    name: 'Berlin-Mitte',
    level: 'bundestag',
    representatives: [
      { name: 'Erika Muster', party: 'SPD', role: 'MdB', constituency: 'Berlin-Mitte' },
    ],
  },
];

describe('Political API — DB fallback', () => {
  let server: Server;
  let baseUrl: string;
  let cache: ReturnType<typeof createCache>;
  const mockDb = {} as any;

  beforeAll(async () => {
    cache = createCache();
    const app = express();
    app.use('/api', createPoliticalRouter(cache, mockDb));

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => { server.close(() => resolve()); });
  });

  beforeEach(() => {
    cache.clear();
    vi.mocked(loadPoliticalDistricts).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the stored data once the 7-day cache entry has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    cache.set('berlin:political:bundestag', storedDistricts, 604800);
    vi.setSystemTime(Date.now() + WEEK_MS + 60_000);

    const fetchedAt = new Date('2026-10-19T04:00:12Z');
    vi.mocked(loadPoliticalDistricts).mockResolvedValue({ data: storedDistricts, fetchedAt });

    const res = await fetch(`${baseUrl}/api/berlin/political/bundestag`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual(storedDistricts);
    expect(body.fetchedAt).toBe(fetchedAt.toISOString());
    expect(vi.mocked(loadPoliticalDistricts)).toHaveBeenCalledWith(mockDb, 'berlin', 'bundestag');
  });

  it('re-warms the cache from the DB so the next request skips it', async () => {
    const fetchedAt = new Date('2026-10-19T04:00:12Z');
    vi.mocked(loadPoliticalDistricts).mockResolvedValue({ data: storedDistricts, fetchedAt });

    await fetch(`${baseUrl}/api/berlin/political/bundestag`);
    const res = await fetch(`${baseUrl}/api/berlin/political/bundestag`);
    const body = await res.json();

    expect(body.data).toEqual(storedDistricts);
    expect(body.fetchedAt).toBe(fetchedAt.toISOString());
    expect(vi.mocked(loadPoliticalDistricts)).toHaveBeenCalledTimes(1);
  });

  it('serves the cache without reading the DB while the entry is valid', async () => {
    cache.set('berlin:political:state', storedDistricts, 604800);

    const res = await fetch(`${baseUrl}/api/berlin/political/state`);
    const body = await res.json();

    expect(body.data).toEqual(storedDistricts);
    expect(vi.mocked(loadPoliticalDistricts)).not.toHaveBeenCalled();
  });

  it('returns the empty default when the DB has no row', async () => {
    vi.mocked(loadPoliticalDistricts).mockResolvedValue(null);

    const res = await fetch(`${baseUrl}/api/berlin/political/state-bezirke`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: [], fetchedAt: null });
  });

  it('returns the empty default when the DB read throws', async () => {
    vi.mocked(loadPoliticalDistricts).mockRejectedValue(new Error('connection refused'));

    const res = await fetch(`${baseUrl}/api/berlin/political/bundestag`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ data: [], fetchedAt: null });
  });

  it('rejects an unknown level before reading the DB', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/political/nina`);

    expect(res.status).toBe(400);
    expect(vi.mocked(loadPoliticalDistricts)).not.toHaveBeenCalled();
  });
});
