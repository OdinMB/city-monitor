/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warmCache } from './warm-cache.js';
import { createCache } from '../lib/cache.js';

vi.mock('./reads.js', () => ({
  loadWeather: vi.fn().mockResolvedValue({ current: { temp: 10 }, hourly: [], daily: [], alerts: [] }),
  loadTransitAlerts: vi.fn().mockResolvedValue([{ id: '1', line: 'U2', type: 'disruption', severity: 'high', message: 'Test', detail: 'Test detail', station: 'Alexanderplatz', location: { lat: 52.52, lon: 13.41 }, affectedStops: [] }]),
  loadEvents: vi.fn().mockResolvedValue([{ id: '1', title: 'Event', date: '2026-03-03', category: 'other', url: '' }]),
  loadSafetyReports: vi.fn().mockResolvedValue([{ id: '1', title: 'Report', description: '', publishedAt: '', url: '' }]),
  loadSummary: vi.fn().mockResolvedValue({ briefing: 'Test', generatedAt: '2026-03-02', headlineCount: 5, cached: true, headlineHash: 'abc' }),
}));

describe('warmCache', () => {
  let cache: ReturnType<typeof createCache>;

  beforeEach(() => {
    cache = createCache();
  });

  it('populates cache from DB for active cities', async () => {
    const db = {} as any; // reads are mocked
    await warmCache(db, cache);

    expect(cache.get('berlin:weather')).not.toBeNull();
    expect(cache.get('berlin:transit:alerts')).not.toBeNull();
    expect(cache.get('berlin:events:upcoming')).not.toBeNull();
    expect(cache.get('berlin:safety:recent')).not.toBeNull();
    expect(cache.get('berlin:news:summary')).not.toBeNull();
  });

  it('handles null returns from DB gracefully', async () => {
    const reads = await import('./reads.js');
    vi.mocked(reads.loadWeather).mockResolvedValueOnce(null);
    vi.mocked(reads.loadTransitAlerts).mockResolvedValueOnce(null);
    vi.mocked(reads.loadEvents).mockResolvedValueOnce(null);
    vi.mocked(reads.loadSafetyReports).mockResolvedValueOnce(null);
    vi.mocked(reads.loadSummary).mockResolvedValueOnce(null);

    const db = {} as any;
    await warmCache(db, cache);

    expect(cache.get('berlin:weather')).toBeNull();
    expect(cache.get('berlin:transit:alerts')).toBeNull();
  });

  it('continues warming other domains if one fails', async () => {
    const reads = await import('./reads.js');
    vi.mocked(reads.loadWeather).mockRejectedValueOnce(new Error('DB error'));

    const db = {} as any;
    await warmCache(db, cache);

    // Weather should be null (failed), but others should be populated
    expect(cache.get('berlin:weather')).toBeNull();
    expect(cache.get('berlin:transit:alerts')).not.toBeNull();
  });
});
