import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { Server } from 'node:http';
import express from 'express';
import type { CityEvent } from '@city-monitor/shared';
import type { Db } from '../db/index.js';
import { createCache } from '../lib/cache.js';
import { CK } from '../lib/cache-keys.js';
import { createEventsRouter } from './events.js';
import { createBootstrapRouter } from './bootstrap.js';
import { createApp } from '../app.js';

const loadEvents = vi.hoisted(() => vi.fn());
vi.mock('../db/reads.js', async (importOriginal) => ({ ...(await importOriginal<object>()), loadEvents }));

/** An invented preview token for the tests */
const TOKEN = 'p'.repeat(24);
const EVENTS: CityEvent[] = [
  { id: 'k-1', title: 'Öffentlich', date: '2099-01-01T19:00:00', category: 'music', url: '', source: 'kulturdaten' },
  { id: 'hht-1', title: 'Vorschau', date: '2099-01-02T19:00:00', category: 'market', url: '', source: 'hht' },
];

function listen(app: express.Express): Promise<{ server: Server; base: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      resolve({ server, base: `http://localhost:${typeof addr === 'object' && addr ? addr.port : 0}` });
    });
  });
}

describe('HHT preview gate on every read path', () => {
  const cache = createCache();
  const app = express();
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'public, max-age=1800'); next(); });
  app.use('/api', createBootstrapRouter(cache));
  app.use('/api', createEventsRouter(cache, {} as Db));
  let server: Server;
  let base: string;

  beforeAll(async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    ({ server, base } = await listen(app));
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    cache.delete(CK.eventsUpcoming('hamburg'));
  });

  const paths = {
    'events (memory cache)': async (headers: Record<string, string>) => {
      cache.set(CK.eventsUpcoming('hamburg'), EVENTS, 60);
      const res = await fetch(`${base}/api/hamburg/events`, { headers });
      return { res, ids: ((await res.json()).data as CityEvent[]).map((e) => e.id) };
    },
    'events (database fallback)': async (headers: Record<string, string>) => {
      loadEvents.mockResolvedValueOnce({ data: EVENTS, fetchedAt: new Date() });
      const res = await fetch(`${base}/api/hamburg/events`, { headers });
      cache.delete(CK.eventsUpcoming('hamburg'));
      return { res, ids: ((await res.json()).data as CityEvent[]).map((e) => e.id) };
    },
    bootstrap: async (headers: Record<string, string>) => {
      cache.set(CK.eventsUpcoming('hamburg'), EVENTS, 60);
      const res = await fetch(`${base}/api/hamburg/bootstrap`, { headers });
      return { res, ids: ((await res.json()).events.data as CityEvent[]).map((e) => e.id) };
    },
  };

  describe.each(Object.entries(paths))('%s', (_name, read) => {
    it('leaves HHT events out without a token, and varies on the token header', async () => {
      vi.stubEnv('HHT_EVENTS_PREVIEW_TOKEN', TOKEN);
      const { res, ids } = await read({});
      expect(ids).toEqual(['k-1']);
      expect(res.headers.get('vary')).toMatch(/X-Preview-Token/i);
      expect(res.headers.get('cache-control')).toBe('public, max-age=1800');
    });

    it('leaves them out for a wrong token', async () => {
      vi.stubEnv('HHT_EVENTS_PREVIEW_TOKEN', TOKEN);
      const { ids } = await read({ 'X-Preview-Token': `${TOKEN}x` });
      expect(ids).toEqual(['k-1']);
    });

    it('leaves them out when no token is configured, whatever is sent', async () => {
      const { ids } = await read({ 'X-Preview-Token': '' });
      expect(ids).toEqual(['k-1']);
      const again = await read({ 'X-Preview-Token': 'undefined' });
      expect(again.ids).toEqual(['k-1']);
    });

    it('includes them for the right token, in a response no cache may keep', async () => {
      vi.stubEnv('HHT_EVENTS_PREVIEW_TOKEN', TOKEN);
      const { res, ids } = await read({ 'X-Preview-Token': TOKEN });
      expect(ids).toEqual(['k-1', 'hht-1']);
      expect(res.headers.get('cache-control')).toBe('private, no-store');
    });

    it('includes them for everyone once HHT_EVENTS_PUBLIC is true', async () => {
      vi.stubEnv('HHT_EVENTS_PUBLIC', 'true');
      const { res, ids } = await read({});
      expect(ids).toEqual(['k-1', 'hht-1']);
      expect(res.headers.get('cache-control')).toBe('public, max-age=1800');
    });
  });

  it('ignores a configured token shorter than 16 characters', async () => {
    const short = 'p'.repeat(8);
    vi.stubEnv('HHT_EVENTS_PREVIEW_TOKEN', short);
    const { ids } = await paths['events (memory cache)']({ 'X-Preview-Token': short });
    expect(ids).toEqual(['k-1']);
  });
});

describe('CORS', () => {
  let server: Server;
  let base: string;
  beforeAll(async () => {
    const { app } = await createApp({ skipScheduler: true });
    ({ server, base } = await listen(app));
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('lets the web app send the preview token header', async () => {
    const res = await fetch(`${base}/api/hamburg/events`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-preview-token' },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('x-preview-token');
  });
});
