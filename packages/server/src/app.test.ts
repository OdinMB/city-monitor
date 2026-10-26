import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { CK } from './lib/cache-keys.js';

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
