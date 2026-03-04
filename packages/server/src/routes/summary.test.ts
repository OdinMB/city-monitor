import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../app.js';
import type { NewsSummary } from '../cron/summarize.js';

describe('Summary API', () => {
  let server: Server;
  let baseUrl: string;
  let appContext: Awaited<ReturnType<typeof createApp>>;

  beforeAll(async () => {
    appContext = await createApp({ skipScheduler: true });
    await new Promise<void>((resolve) => {
      server = appContext.app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/berlin/news/summary returns null when no summary', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/news/summary`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.briefing).toBeNull();
    expect(body.fetchedAt).toBeNull();
  });

  it('GET /api/berlin/news/summary returns default language briefing from cache', async () => {
    const mockSummary: NewsSummary & { headlineHash: string } = {
      briefings: {
        de: 'Berlin erlebte heute große Verkehrsstörungen.',
        en: 'Berlin saw major transit disruptions today.',
      },
      generatedAt: '2026-03-02T10:00:00Z',
      headlineCount: 10,
      cached: true,
      headlineHash: 'abc123',
    };
    appContext.cache.set('berlin:news:summary', mockSummary, 60);

    const res = await fetch(`${baseUrl}/api/berlin/news/summary`);
    const body = await res.json();
    expect(res.status).toBe(200);
    // Default lang for Berlin is 'de'
    expect(body.data.briefing).toBe('Berlin erlebte heute große Verkehrsstörungen.');
    expect(typeof body.fetchedAt).toBe('string');
  });

  it('GET /api/berlin/news/summary?lang=en returns English briefing', async () => {
    const mockSummary: NewsSummary & { headlineHash: string } = {
      briefings: {
        de: 'Deutsche Zusammenfassung.',
        en: 'English summary.',
        tr: 'Türkçe özet.',
      },
      generatedAt: '2026-03-02T10:00:00Z',
      headlineCount: 5,
      cached: true,
      headlineHash: 'def456',
    };
    appContext.cache.set('berlin:news:summary', mockSummary, 60);

    const res = await fetch(`${baseUrl}/api/berlin/news/summary?lang=en`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.briefing).toBe('English summary.');
  });

  it('GET /api/berlin/news/summary?lang=tr returns Turkish briefing', async () => {
    const res = await fetch(`${baseUrl}/api/berlin/news/summary?lang=tr`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.briefing).toBe('Türkçe özet.');
  });

  it('falls back to primary language when requested lang is missing', async () => {
    const mockSummary: NewsSummary & { headlineHash: string } = {
      briefings: {
        de: 'Nur deutsch verfügbar.',
      },
      generatedAt: '2026-03-02T10:00:00Z',
      headlineCount: 3,
      cached: true,
      headlineHash: 'ghi789',
    };
    appContext.cache.set('berlin:news:summary', mockSummary, 60);

    const res = await fetch(`${baseUrl}/api/berlin/news/summary?lang=ar`);
    const body = await res.json();
    expect(res.status).toBe(200);
    // Falls back to 'de' (Berlin's primary language)
    expect(body.data.briefing).toBe('Nur deutsch verfügbar.');
  });

  it('GET /api/unknown/news/summary returns 404', async () => {
    const res = await fetch(`${baseUrl}/api/unknown/news/summary`);
    expect(res.status).toBe(404);
  });
});
