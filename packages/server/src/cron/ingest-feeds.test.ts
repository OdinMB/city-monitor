/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createFeedIngestion, type NewsDigest } from './ingest-feeds.js';
import { hashString } from '../lib/hash.js';

vi.mock('../lib/openai.js', () => ({
  filterAndGeolocateNews: vi.fn().mockResolvedValue(null),
}));

vi.mock('../db/reads.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/reads.js')>();
  return {
    ...actual,
    loadNewsItems: vi.fn().mockResolvedValue(null),
  };
});

vi.mock('../db/writes.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/writes.js')>();
  return {
    ...actual,
    saveNewsItems: vi.fn().mockResolvedValue(undefined),
  };
});

const mockFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>BVG-Streik legt Berliner Nahverkehr lahm</title>
      <link>https://example.com/article-1</link>
      <pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate>
      <description>Der Nahverkehr in Berlin steht still.</description>
    </item>
    <item>
      <title>Neuer Radweg am Alexanderplatz eröffnet</title>
      <link>https://example.com/article-2</link>
      <pubDate>Mon, 02 Mar 2026 08:00:00 GMT</pubDate>
      <description>Berlin bekommt einen neuen Radweg.</description>
    </item>
    <item>
      <title>Bundesliga: Bayern München besiegt Dortmund</title>
      <link>https://example.com/article-3</link>
      <pubDate>Mon, 02 Mar 2026 06:00:00 GMT</pubDate>
      <description>Ein spannendes Spiel in der Bundesliga.</description>
    </item>
  </channel>
</rss>`;

describe('ingest-feeds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches feeds and writes NewsDigest to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createFeedIngestion(cache);
    await ingest();

    const digest = cache.get<NewsDigest>('berlin:news:digest');
    expect(digest).toBeTruthy();
    expect(digest!.items.length).toBe(3);
    expect(digest!.updatedAt).toBeTruthy();
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createFeedIngestion(cache);
    await ingest(); // should not throw

    const digest = cache.get<NewsDigest>('berlin:news:digest');
    // Empty digest is written since there are no items
    expect(digest?.items.length ?? 0).toBe(0);
  });
});

describe('ingest-feeds — DB assessment reuse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips LLM filter for items already assessed in DB', async () => {
    const { filterAndGeolocateNews } = await import('../lib/openai.js');
    const { loadNewsItems } = await import('../db/reads.js');

    const hash1 = hashString('https://example.com/article-1' + 'BVG-Streik legt Berliner Nahverkehr lahm');
    const hash2 = hashString('https://example.com/article-2' + 'Neuer Radweg am Alexanderplatz eröffnet');
    const hash3 = hashString('https://example.com/article-3' + 'Bundesliga: Bayern München besiegt Dortmund');

    // All 3 items already in DB with assessments
    vi.mocked(loadNewsItems).mockResolvedValue([
      {
        id: hash1,
        title: 'BVG-Streik legt Berliner Nahverkehr lahm',
        url: 'https://example.com/article-1',
        publishedAt: '2026-03-02T10:00:00.000Z',
        sourceName: 'Test Feed',
        sourceUrl: 'mock://feed',
        category: 'transit',
        tier: 1,
        lang: 'de',
        location: { lat: 52.52, lon: 13.41, label: 'Alexanderplatz' },
        assessment: { relevant: true, confidence: 0.95 },
      },
      {
        id: hash2,
        title: 'Neuer Radweg am Alexanderplatz eröffnet',
        url: 'https://example.com/article-2',
        publishedAt: '2026-03-02T08:00:00.000Z',
        sourceName: 'Test Feed',
        sourceUrl: 'mock://feed',
        category: 'local',
        tier: 1,
        lang: 'de',
        assessment: { relevant: true, confidence: 0.8 },
      },
      {
        id: hash3,
        title: 'Bundesliga: Bayern München besiegt Dortmund',
        url: 'https://example.com/article-3',
        publishedAt: '2026-03-02T06:00:00.000Z',
        sourceName: 'Test Feed',
        sourceUrl: 'mock://feed',
        category: 'local',
        tier: 1,
        lang: 'de',
        assessment: { relevant: false, confidence: 0.95 },
      },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const mockDb = {} as Parameters<typeof createFeedIngestion>[1];
    const ingest = createFeedIngestion(cache, mockDb);
    await ingest();

    // filterAndGeolocateNews should NOT be called — all items already assessed
    expect(filterAndGeolocateNews).not.toHaveBeenCalled();

    // Cached digest should have items with carried-over location
    const digest = cache.get<NewsDigest>('berlin:news:digest')!;
    expect(digest).toBeTruthy();
    const bvgItem = digest.items.find((i) => i.title.includes('BVG'));
    expect(bvgItem?.location).toEqual({ lat: 52.52, lon: 13.41, label: 'Alexanderplatz' });
  });

  it('sends only new items through LLM filter when some are already in DB', async () => {
    const { filterAndGeolocateNews } = await import('../lib/openai.js');
    const { loadNewsItems } = await import('../db/reads.js');

    const hash1 = hashString('https://example.com/article-1' + 'BVG-Streik legt Berliner Nahverkehr lahm');

    // Only item 1 in DB; items 2 and 3 are new
    vi.mocked(loadNewsItems).mockResolvedValue([
      {
        id: hash1,
        title: 'BVG-Streik legt Berliner Nahverkehr lahm',
        url: 'https://example.com/article-1',
        publishedAt: '2026-03-02T10:00:00.000Z',
        sourceName: 'Test Feed',
        sourceUrl: 'mock://feed',
        category: 'transit',
        tier: 1,
        lang: 'de',
        assessment: { relevant: true, confidence: 0.95 },
      },
    ]);

    // LLM filter returns verdicts for the 2 new items
    vi.mocked(filterAndGeolocateNews).mockResolvedValue([
      { index: 0, relevant: true, confidence: 0.8, locationLabel: 'Alexanderplatz' },
      { index: 1, relevant: false, confidence: 0.85 },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const mockDb = {} as Parameters<typeof createFeedIngestion>[1];
    const ingest = createFeedIngestion(cache, mockDb);
    await ingest();

    // filterAndGeolocateNews should be called with only the 2 new items
    expect(filterAndGeolocateNews).toHaveBeenCalledTimes(1);
    const passedItems = vi.mocked(filterAndGeolocateNews).mock.calls[0][2];
    expect(passedItems).toHaveLength(2);
    expect(passedItems[0].title).toBe('Neuer Radweg am Alexanderplatz eröffnet');
    expect(passedItems[1].title).toBe('Bundesliga: Bayern München besiegt Dortmund');
  });

  it('persists assessed items to DB after ingestion', async () => {
    const { saveNewsItems } = await import('../db/writes.js');
    const { loadNewsItems } = await import('../db/reads.js');

    vi.mocked(loadNewsItems).mockResolvedValue(null);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const mockDb = {} as Parameters<typeof createFeedIngestion>[1];
    const ingest = createFeedIngestion(cache, mockDb);
    await ingest();

    // saveNewsItems should be called once per city
    expect(saveNewsItems).toHaveBeenCalledTimes(1);
    const [_db, cityId, items] = vi.mocked(saveNewsItems).mock.calls[0];
    expect(cityId).toBe('berlin');
    expect(items.length).toBe(3);
  });

  it('drops irrelevant items from digest using assessment data from DB', async () => {
    const { loadNewsItems } = await import('../db/reads.js');

    const hash1 = hashString('https://example.com/article-1' + 'BVG-Streik legt Berliner Nahverkehr lahm');
    const hash2 = hashString('https://example.com/article-2' + 'Neuer Radweg am Alexanderplatz eröffnet');
    const hash3 = hashString('https://example.com/article-3' + 'Bundesliga: Bayern München besiegt Dortmund');

    // Item 3 is assessed as irrelevant → should be dropped from digest
    vi.mocked(loadNewsItems).mockResolvedValue([
      {
        id: hash1,
        title: 'BVG-Streik legt Berliner Nahverkehr lahm',
        url: 'https://example.com/article-1',
        publishedAt: '2026-03-02T10:00:00.000Z',
        sourceName: 'Test Feed',
        sourceUrl: 'mock://feed',
        category: 'transit',
        tier: 1,
        lang: 'de',
        assessment: { relevant: true, confidence: 0.95 },
      },
      {
        id: hash2,
        title: 'Neuer Radweg am Alexanderplatz eröffnet',
        url: 'https://example.com/article-2',
        publishedAt: '2026-03-02T08:00:00.000Z',
        sourceName: 'Test Feed',
        sourceUrl: 'mock://feed',
        category: 'local',
        tier: 1,
        lang: 'de',
        assessment: { relevant: true, confidence: 0.8 },
      },
      {
        id: hash3,
        title: 'Bundesliga: Bayern München besiegt Dortmund',
        url: 'https://example.com/article-3',
        publishedAt: '2026-03-02T06:00:00.000Z',
        sourceName: 'Test Feed',
        sourceUrl: 'mock://feed',
        category: 'local',
        tier: 1,
        lang: 'de',
        assessment: { relevant: false, confidence: 0.95 },
      },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const mockDb = {} as Parameters<typeof createFeedIngestion>[1];
    const ingest = createFeedIngestion(cache, mockDb);
    await ingest();

    // Digest should only have 2 items (item 3 dropped: relevant === false)
    const digest = cache.get<NewsDigest>('berlin:news:digest')!;
    expect(digest.items.length).toBe(2);
    expect(digest.items.every((i) => !i.title.includes('Bundesliga'))).toBe(true);
  });

  it('works without DB (cache-only mode)', async () => {
    // Reset LLM mock to default (return null = no assessment) since prior tests override it
    const { filterAndGeolocateNews } = await import('../lib/openai.js');
    vi.mocked(filterAndGeolocateNews).mockResolvedValue(null);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createFeedIngestion(cache, null);
    await ingest();

    const digest = cache.get<NewsDigest>('berlin:news:digest');
    expect(digest).toBeTruthy();
    expect(digest!.items.length).toBe(3);
  });
});
