import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
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

    const { scheduler, cache } = await createApp({ synthetic: true });

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
