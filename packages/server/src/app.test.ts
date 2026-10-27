import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createApp } from './app.js';
import { hamburg } from './config/cities/hamburg.js';
import { CK } from './lib/cache-keys.js';
import type { ScheduledJob } from './lib/scheduler.js';

// Capture the job list instead of starting node-cron and the startup runs
const scheduled = vi.hoisted(() => ({ jobs: [] as ScheduledJob[] }));
vi.mock('./lib/scheduler.js', () => ({
  createScheduler: (jobs: ScheduledJob[]) => {
    scheduled.jobs = jobs;
    return { getJobs: () => [], stop: () => {}, triggerJob: async () => false };
  },
}));

// Stand-in for a connected database whose stored data is all fresh; off by default
const freshDb = vi.hoisted(() => ({ on: false }));
// Stand-in for a connected database that answers the real freshness queries
// with `stored.execute`; off (null) by default
const stored = vi.hoisted(() => ({ execute: null as null | ((query: SQL) => Promise<unknown[]>) }));
vi.mock('./db/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db/index.js')>();
  const fake = () => freshDb.on || stored.execute !== null;
  return {
    ...actual,
    createDb: () => (fake() ? { db: { execute: (query: SQL) => stored.execute?.(query) }, client: {} } : actual.createDb()),
    testConnection: async (db: Parameters<typeof actual.testConnection>[0]) => (fake() ? undefined : actual.testConnection(db)),
  };
});
vi.mock('./db/warm-cache.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./db/warm-cache.js')>();
  return {
    ...actual,
    warmCache: async (...args: Parameters<typeof actual.warmCache>) => (freshDb.on || stored.execute ? undefined : actual.warmCache(...args)),
    findStaleJobs: async (...args: Parameters<typeof actual.findStaleJobs>) => (freshDb.on ? new Set<string>() : actual.findStaleJobs(...args)),
  };
});

/**
 * Answers the startup freshness queries as a database would that holds a fresh
 * row of every source for each city in `freshCities` and no row for any other
 * city. A query with a city condition gets one row per listed fresh city; the
 * table-wide query gets the newest row of any city.
 */
function rowsFreshFor(freshCities: string[]) {
  const dialect = new PgDialect();
  return async (query: SQL) => {
    const { sql: text, params } = dialect.sqlToQuery(query);
    const epoch = Date.now() / 1000;
    if (!text.includes('"city_id" IN')) return freshCities.length > 0 ? [{ epoch }] : [];
    return freshCities.filter((id) => params.includes(id)).map((id) => ({ city_id: id, epoch }));
  };
}

describe('createApp in synthetic mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('registers no jobs and makes no outbound requests', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const fetchSpy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
    scheduled.jobs = [];

    const { scheduler, cache } = await createApp({ synthetic: true });

    // No scheduler at all, so not even the always-on-start ingest-aq-grid runs
    expect(scheduled.jobs).toEqual([]);
    expect(scheduler.getJobs()).toEqual([]);
    expect(await scheduler.triggerJob('ingest-feeds')).toBe(false);
    // No RainViewer fetch from the weather tiles router
    expect(fetchSpy).not.toHaveBeenCalled();
    // The seeded placeholder names are not replaced with the hardcoded mayors
    expect(cache.get(CK.political('berlin', 'bezirke'))).toBeNull();
  });
});

describe('createApp startup runs for Berlin-only jobs', () => {
  const BERLIN_ONLY = ['ingest-bathing', 'ingest-wastewater', 'ingest-labor-market', 'ingest-population', 'ingest-feuerwehr'];
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scheduled.jobs = [];
    // No DB: every job with a freshness spec is due on start
    vi.stubEnv('DATABASE_URL', '');
    fetchSpy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const names = (jobs: ScheduledJob[]) => jobs.map((j) => j.name);

  it.each(['berlin', 'berlin,hamburg', 'hamburg,berlin'])(
    'schedules every job and runs every ingestion job on start when ACTIVE_CITIES=%s',
    async (activeCities) => {
      vi.stubEnv('ACTIVE_CITIES', activeCities);
      await createApp();

      expect(scheduled.jobs).toHaveLength(26);
      for (const name of BERLIN_ONLY) expect(names(scheduled.jobs)).toContain(name);
      expect(names(scheduled.jobs.filter((j) => j.runOnStart)))
        .toEqual(names(scheduled.jobs.filter((j) => j.name !== 'data-retention')));
    },
  );

  it('keeps the Berlin-only jobs scheduled but drops their startup run when only Hamburg is active', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    await createApp();

    expect(scheduled.jobs).toHaveLength(26);
    expect(names(scheduled.jobs.filter((j) => j.runOnStart)))
      .toEqual(names(scheduled.jobs.filter((j) => j.name !== 'data-retention' && !BERLIN_ONLY.includes(j.name))));
  });

  it('runs the Berlin-only handlers without any request when only Hamburg is active', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    const { cache } = await createApp();
    fetchSpy.mockClear(); // the weather tiles router fetches RainViewer on creation
    const sizeBefore = cache.size();

    for (const name of BERLIN_ONLY) {
      await scheduled.jobs.find((j) => j.name === name)!.handler();
    }

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(cache.size()).toBe(sizeBefore);
  });
});

describe('createApp startup runs with fresh stored data', () => {
  beforeEach(() => {
    scheduled.jobs = [];
    freshDb.on = true;
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  });

  afterEach(() => {
    freshDb.on = false;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('still runs the air-quality grid job on start, since the stored grid has no WAQI stations', async () => {
    await createApp();

    expect(scheduled.jobs).toHaveLength(26);
    const startup = scheduled.jobs.filter((j) => j.runOnStart).map((j) => j.name);
    expect(startup).toEqual(['ingest-aq-grid']);
  });
});

describe('createApp startup runs per active city', () => {
  const startupRuns = () => scheduled.jobs.filter((j) => j.runOnStart).map((j) => j.name);
  const ingestionJobs = () => scheduled.jobs.filter((j) => j.name !== 'data-retention').map((j) => j.name);

  beforeEach(() => {
    scheduled.jobs = [];
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
  });

  afterEach(() => {
    stored.execute = null;
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('runs only the air-quality grid job when Berlin, the only active city, has fresh data', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    stored.execute = rowsFreshFor(['berlin']);
    await createApp();

    expect(startupRuns()).toEqual(['ingest-aq-grid']);
  });

  it('runs every ingestion job when Berlin, the only active city, has no data', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    stored.execute = rowsFreshFor([]);
    await createApp();

    expect(startupRuns()).toEqual(ingestionJobs());
  });

  it('runs only the air-quality grid job when every active city has fresh data', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    stored.execute = rowsFreshFor(['berlin', 'hamburg']);
    await createApp();

    expect(startupRuns()).toEqual(['ingest-aq-grid']);
  });

  it('runs the jobs that serve a newly activated city without data, and no Berlin-only job', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    stored.execute = rowsFreshFor(['berlin']);
    await createApp();

    expect(startupRuns()).toEqual([
      'ingest-feeds', 'summarize-news', 'ingest-weather', 'ingest-safety', 'ingest-nina',
      'ingest-pharmacies', 'ingest-traffic', 'ingest-political', 'ingest-aq-grid', 'ingest-aeds',
      'ingest-water-levels', 'ingest-pollen',
    ]);
  });

  it('does not run the appointments job for a city with an appointments source but no rows while another city\'s rows are fresh', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    stored.execute = rowsFreshFor(['berlin']);
    hamburg.dataSources.appointments = { provider: 'service-berlin', services: [{ id: '1', name: 'Test' }] };
    try {
      await createApp();
    } finally {
      delete hamburg.dataSources.appointments;
    }

    expect(startupRuns()).not.toContain('ingest-appointments');
  });
});

describe('production CORS and client address', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ALLOWED_ORIGINS', '');
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const { app } = await createApp({ synthetic: true });
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
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it.each(['https://citymonitor.app', 'https://www.citymonitor.app', 'https://city-monitor-web.onrender.com'])(
    'lets the site on %s call the API without ALLOWED_ORIGINS',
    async (origin) => {
      const res = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
    },
  );

  it.each(['https://example.org', 'http://localhost:5173'])('does not let %s call the API', async (origin) => {
    const res = await fetch(`${baseUrl}/api/health`, { headers: { Origin: origin } });
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rate-limits by the address two proxies back, ignoring entries the caller adds in front', async () => {
    const remaining = async (forwardedFor: string) => {
      const res = await fetch(`${baseUrl}/api/health`, { headers: { 'X-Forwarded-For': forwardedFor } });
      return res.headers.get('ratelimit-remaining');
    };
    // The test socket stands in for the nearest proxy, 172.16.0.2 for the one before it
    expect(await remaining('198.51.100.23, 172.16.0.2')).toBe('99');
    expect(await remaining('203.0.113.7, 198.51.100.23, 172.16.0.2')).toBe('98');
    expect(await remaining('198.51.100.24, 172.16.0.2')).toBe('99');
  });
});

describe('request bodies', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
    const { app } = await createApp({ synthetic: true });
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
    vi.unstubAllEnvs();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('refuses a gzip-encoded JSON body with 415 and keeps serving', async () => {
    // Trailing bytes after the gzip member are the shape of GHSA-27r3-jxmh-p828
    const body = Buffer.concat([gzipSync(JSON.stringify({ a: 1 })), Buffer.from('trailing')]);
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body,
    });
    expect(res.status).toBe(415);

    const health = await fetch(`${baseUrl}/api/health`);
    expect(health.status).toBe(200);
  });

  it('refuses a JSON body over 10kb with 413', async () => {
    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pad: 'x'.repeat(11 * 1024) }),
    });
    expect(res.status).toBe(413);
  });
});
