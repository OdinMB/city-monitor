/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from './cache.js';

describe('Cache', () => {
  let cache: ReturnType<typeof createCache>;

  beforeEach(() => {
    cache = createCache();
  });

  it('returns null for missing key', () => {
    expect(cache.get('missing')).toBeNull();
  });

  it('set/get round-trip works', () => {
    cache.set('key', { value: 42 }, 60);
    expect(cache.get('key')).toEqual({ value: 42 });
  });

  it('delete removes entry', () => {
    cache.set('key', 'data', 60);
    cache.delete('key');
    expect(cache.get('key')).toBeNull();
  });

  it('expired entries return null', () => {
    vi.useFakeTimers();
    cache.set('key', 'data', 1); // 1 second TTL
    vi.advanceTimersByTime(2000);
    expect(cache.get('key')).toBeNull();
    vi.useRealTimers();
  });

  it('fetch calls fetcher on cache miss', async () => {
    const fetcher = vi.fn().mockResolvedValue({ result: 'fresh' });
    const result = await cache.fetch('key', 60, fetcher);
    expect(result).toEqual({ result: 'fresh' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('fetch returns cached value without calling fetcher', async () => {
    cache.set('key', { result: 'cached' }, 60);
    const fetcher = vi.fn().mockResolvedValue({ result: 'fresh' });
    const result = await cache.fetch('key', 60, fetcher);
    expect(result).toEqual({ result: 'cached' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('fetch coalesces concurrent calls', async () => {
    let resolveFirst!: (v: unknown) => void;
    const fetcher = vi.fn().mockReturnValue(
      new Promise((resolve) => { resolveFirst = resolve; }),
    );

    const p1 = cache.fetch('key', 60, fetcher);
    const p2 = cache.fetch('key', 60, fetcher);

    resolveFirst({ data: 'shared' });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual({ data: 'shared' });
    expect(r2).toEqual({ data: 'shared' });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('negative caching stores null result', async () => {
    const fetcher = vi.fn().mockResolvedValue(null);
    const r1 = await cache.fetch('key', 60, fetcher, 10);
    expect(r1).toBeNull();

    // Second call should not invoke fetcher (negative cache hit)
    const r2 = await cache.fetch('key', 60, fetcher, 10);
    expect(r2).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('getBatch returns multiple values', () => {
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);
    const result = cache.getBatch(['a', 'b', 'missing']);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it('getWithMeta returns data with fetchedAt timestamp', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-03T12:00:00Z'));
    cache.set('key', { value: 42 }, 60);
    const result = cache.getWithMeta<{ value: number }>('key');
    expect(result).toEqual({
      data: { value: 42 },
      fetchedAt: '2026-03-03T12:00:00.000Z',
    });
    vi.useRealTimers();
  });

  it('getWithMeta returns null for missing key', () => {
    expect(cache.getWithMeta('missing')).toBeNull();
  });

  it('getWithMeta returns null for expired key', () => {
    vi.useFakeTimers();
    cache.set('key', 'data', 1);
    vi.advanceTimersByTime(2000);
    expect(cache.getWithMeta('key')).toBeNull();
    vi.useRealTimers();
  });

  it('getBatchWithMeta returns wrapped entries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-03T12:00:00Z'));
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);
    const result = cache.getBatchWithMeta(['a', 'b', 'missing']);
    expect(result).toEqual({
      a: { data: 1, fetchedAt: '2026-03-03T12:00:00.000Z' },
      b: { data: 2, fetchedAt: '2026-03-03T12:00:00.000Z' },
    });
    vi.useRealTimers();
  });
});
