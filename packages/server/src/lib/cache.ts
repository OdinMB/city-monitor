interface Entry {
  value: unknown;
  expiry: number;
  updatedAt: number;
}

/**
 * Creates an in-memory cache with TTL expiration, request deduplication,
 * and negative caching for null results.
 */
export function createCache() {
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Promise<unknown>>();

  function isValid(e: Entry | undefined): e is Entry {
    return e !== undefined && e.expiry > Date.now();
  }

  function get<T>(key: string): T | null {
    const e = entries.get(key);
    if (!isValid(e)) {
      if (e) entries.delete(key);
      return null;
    }
    return e.value as T;
  }

  function set(key: string, value: unknown, ttlSeconds: number, fetchedAt?: Date): void {
    const now = Date.now();
    entries.set(key, { value, expiry: now + ttlSeconds * 1000, updatedAt: fetchedAt?.getTime() ?? now });
  }

  function del(key: string): void {
    entries.delete(key);
  }

  async function fetch<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T | null>,
    negativeTtlSeconds = 120,
  ): Promise<T | null> {
    const cached = get<T>(key);
    if (cached !== null) return cached;

    // If the entry is still valid but holds null, it's a negative cache hit
    const e = entries.get(key);
    if (isValid(e) && e.value === null) return null;

    // Deduplicate concurrent fetches for the same key
    const inflight = pending.get(key);
    if (inflight) return inflight as Promise<T | null>;

    const task = fetcher()
      .then((result) => {
        set(key, result, result !== null ? ttlSeconds : negativeTtlSeconds);
        return result;
      })
      .finally(() => {
        pending.delete(key);
      });

    pending.set(key, task);
    return task;
  }

  function getWithMeta<T>(key: string): { data: T; fetchedAt: string } | null {
    const e = entries.get(key);
    if (!isValid(e)) {
      if (e) entries.delete(key);
      return null;
    }
    return { data: e.value as T, fetchedAt: new Date(e.updatedAt).toISOString() };
  }

  function getBatch(keys: string[]): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const v = get(k);
      if (v !== null) out[k] = v;
    }
    return out;
  }

  function getBatchWithMeta(keys: string[]): Record<string, { data: unknown; fetchedAt: string }> {
    const out: Record<string, { data: unknown; fetchedAt: string }> = {};
    for (const k of keys) {
      const m = getWithMeta(k);
      if (m !== null) out[k] = m;
    }
    return out;
  }

  function size(): number {
    return entries.size;
  }

  function clear(): void {
    entries.clear();
    pending.clear();
  }

  return { get, set, delete: del, fetch, getWithMeta, getBatch, getBatchWithMeta, size, clear };
}

export type Cache = ReturnType<typeof createCache>;
