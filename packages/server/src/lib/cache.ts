/**
 * In-memory cache with TTL, in-flight coalescing, and negative caching.
 *
 * Adapted from World Monitor (AGPL-3.0)
 * Original: server/_shared/redis.ts
 * Copyright (C) 2024-2026 Elie Habib
 *
 * Modifications:
 * - Replaced Redis with in-memory Map (Postgres is now the persistent store)
 * - Removed Vercel-specific env key prefixing
 * - Made cache synchronous for get/set/delete (memory-only)
 * - Kept in-flight coalescing and negative caching patterns
 */

const NEG_SENTINEL = Symbol('NEG_SENTINEL');

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

export function createCache() {
  const store = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<unknown>>();

  function get<T>(key: string): T | null {
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    if (entry.data === NEG_SENTINEL) return null;
    return entry.data as T;
  }

  function set(key: string, data: unknown, ttlSeconds: number): void {
    store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  function del(key: string): void {
    store.delete(key);
  }

  async function fetch<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T | null>,
    negativeTtlSeconds = 120,
  ): Promise<T | null> {
    // Check cache first
    const entry = store.get(key);
    if (entry && Date.now() <= entry.expiresAt) {
      if (entry.data === NEG_SENTINEL) return null;
      return entry.data as T;
    }

    // Coalesce concurrent requests for the same key
    const existing = inflight.get(key);
    if (existing) return existing as Promise<T | null>;

    const promise = fetcher()
      .then((result) => {
        if (result != null) {
          set(key, result, ttlSeconds);
        } else {
          set(key, NEG_SENTINEL, negativeTtlSeconds);
        }
        return result;
      })
      .finally(() => {
        inflight.delete(key);
      });

    inflight.set(key, promise);
    return promise;
  }

  function getBatch(keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const value = get(key);
      if (value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  function size(): number {
    return store.size;
  }

  function clear(): void {
    store.clear();
    inflight.clear();
  }

  return { get, set, delete: del, fetch, getBatch, size, clear };
}

export type Cache = ReturnType<typeof createCache>;
