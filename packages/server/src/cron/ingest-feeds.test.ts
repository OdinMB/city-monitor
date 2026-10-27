import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createFeedIngestion, type NewsDigest } from './ingest-feeds.js';
import { hashString } from '../lib/hash.js';
import { berlin } from '../config/cities/berlin.js';

vi.mock('../lib/openai.js', () => ({
  filterAndGeolocateNews: vi.fn().mockResolvedValue(null),
}));

vi.mock('../db/reads.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/reads.js')>();
  return {
    ...actual,
    loadAllNewsAssessments: vi.fn().mockResolvedValue(null),
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

  it('fetches feeds and writes NewsDigest to cache (unassessed items dropped)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createFeedIngestion(cache);
    await ingest();

    const digest = cache.get<NewsDigest>('berlin:news:digest');
    expect(digest).toBeTruthy();
    // LLM returns null → no assessment → all items dropped
    expect(digest!.items.length).toBe(0);
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
    const { loadAllNewsAssessments } = await import('../db/reads.js');

    const hash1 = hashString('https://example.com/article-1' + 'BVG-Streik legt Berliner Nahverkehr lahm');
    const hash2 = hashString('https://example.com/article-2' + 'Neuer Radweg am Alexanderplatz eröffnet');
    const hash3 = hashString('https://example.com/article-3' + 'Bundesliga: Bayern München besiegt Dortmund');

    // All 3 items already in DB with assessments
    vi.mocked(loadAllNewsAssessments).mockResolvedValue([
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
        assessment: { relevant_to_city: true, importance: 0.7, category: 'transit' },
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
        assessment: { relevant_to_city: true, importance: 0.5, category: 'local' },
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
        assessment: { relevant_to_city: false, importance: 0.2, category: 'sports' },
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
    const { loadAllNewsAssessments } = await import('../db/reads.js');

    const hash1 = hashString('https://example.com/article-1' + 'BVG-Streik legt Berliner Nahverkehr lahm');

    // Only item 1 in DB; items 2 and 3 are new
    vi.mocked(loadAllNewsAssessments).mockResolvedValue([
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
        assessment: { relevant_to_city: true, importance: 0.7, category: 'transit' },
      },
    ]);

    // LLM filter returns verdicts for the 2 new items
    vi.mocked(filterAndGeolocateNews).mockResolvedValue([
      { index: 0, relevant_to_city: true, category: 'local', importance: 0.6, locationLabel: 'Alexanderplatz' },
      { index: 1, relevant_to_city: false, category: 'sports', importance: 0.1 },
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
    const { loadAllNewsAssessments } = await import('../db/reads.js');

    vi.mocked(loadAllNewsAssessments).mockResolvedValue(null);

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
    const { loadAllNewsAssessments } = await import('../db/reads.js');

    const hash1 = hashString('https://example.com/article-1' + 'BVG-Streik legt Berliner Nahverkehr lahm');
    const hash2 = hashString('https://example.com/article-2' + 'Neuer Radweg am Alexanderplatz eröffnet');
    const hash3 = hashString('https://example.com/article-3' + 'Bundesliga: Bayern München besiegt Dortmund');

    // Item 3 is assessed as irrelevant → should be dropped from digest
    vi.mocked(loadAllNewsAssessments).mockResolvedValue([
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
        assessment: { relevant_to_city: true, importance: 0.7, category: 'transit' },
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
        assessment: { relevant_to_city: true, importance: 0.5, category: 'local' },
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
        assessment: { relevant_to_city: false, importance: 0.2, category: 'sports' },
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

  it('works without DB (cache-only mode, unassessed items dropped)', async () => {
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
    // No DB, LLM returns null → no assessment → all items dropped
    expect(digest!.items.length).toBe(0);
  });
});

describe('ingest-feeds — feeds whose text is not stored', () => {
  const rbb24 = berlin.feeds.find((f) => f.name === 'rbb24')!;
  const tagesspiegel = berlin.feeds.find((f) => f.name === 'Tagesspiegel')!;

  function oneItemFeed(title: string, link: string, description: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Feed</title>
  <item>
    <title>${title}</title>
    <link>${link}</link>
    <pubDate>Mon, 02 Mar 2026 10:00:00 GMT</pubDate>
    <description>${description}</description>
  </item>
</channel></rss>`;
  }

  async function ingestRbb24AndTagesspiegel() {
    const { filterAndGeolocateNews } = await import('../lib/openai.js');
    const { saveNewsItems } = await import('../db/writes.js');
    const { loadAllNewsAssessments } = await import('../db/reads.js');

    vi.mocked(loadAllNewsAssessments).mockResolvedValue(null);
    vi.mocked(filterAndGeolocateNews).mockImplementation(async (_cityId, _cityName, items) =>
      items.map((_item, index) => ({ index, relevant_to_city: true, category: 'local', importance: 0.6 })),
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (input === rbb24.url) {
        return new Response(oneItemFeed('Neue Tramlinie in Mitte', 'https://www.rbb24.de/a/1', 'Teaser von rbb24'), { status: 200 });
      }
      if (input === tagesspiegel.url) {
        return new Response(oneItemFeed('Senat beschließt Haushalt', 'https://www.tagesspiegel.de/a/2', 'Teaser vom Tagesspiegel'), { status: 200 });
      }
      return new Response('', { status: 404 });
    });

    const cache = createCache();
    const mockDb = {} as Parameters<typeof createFeedIngestion>[1];
    await createFeedIngestion(cache, mockDb)();

    return {
      classified: vi.mocked(filterAndGeolocateNews).mock.calls[0]![2],
      stored: vi.mocked(saveNewsItems).mock.calls[0]![2],
      digest: cache.get<NewsDigest>('berlin:news:digest')!,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies an rbb24 item with its description but stores only its title and link', async () => {
    const { classified, stored, digest } = await ingestRbb24AndTagesspiegel();

    expect(classified).toContainEqual({ title: 'Neue Tramlinie in Mitte', description: 'Teaser von rbb24', sourceName: 'rbb24' });

    const row = stored.find((item) => item.sourceName === 'rbb24')!;
    expect(row).toMatchObject({ title: 'Neue Tramlinie in Mitte', url: 'https://www.rbb24.de/a/1' });
    expect(row.description).toBeUndefined();

    // The live digest, held in memory only, keeps the description
    expect(digest.items.find((item) => item.sourceName === 'rbb24')?.description).toBe('Teaser von rbb24');
  });

  it('still stores the description of a feed that allows it', async () => {
    const { stored } = await ingestRbb24AndTagesspiegel();

    expect(stored.find((item) => item.sourceName === 'Tagesspiegel')?.description).toBe('Teaser vom Tagesspiegel');
  });
});

// ---------------------------------------------------------------------------
// applyDropLogic — pure function unit tests
// ---------------------------------------------------------------------------

describe('applyDropLogic', () => {
  // Lazy import to avoid hoisting issues with vi.mock
  let applyDropLogic: typeof import('./ingest-feeds.js')['applyDropLogic'];

  beforeEach(async () => {
    ({ applyDropLogic } = await import('./ingest-feeds.js'));
  });

  function makeItem(overrides: Partial<import('../db/writes.js').PersistedNewsItem> = {}): import('../db/writes.js').PersistedNewsItem {
    return {
      id: 'test-' + Math.random().toString(36).slice(2),
      title: 'Test Article',
      url: 'https://example.com/test',
      publishedAt: '2026-03-02T10:00:00Z',
      sourceName: 'Test Feed',
      sourceUrl: 'https://example.com',
      category: 'local',
      tier: 1,
      lang: 'de',
      ...overrides,
    };
  }

  it('drops items with no assessment', () => {
    const items = [makeItem({ assessment: undefined })];
    expect(applyDropLogic(items)).toHaveLength(0);
  });

  it('drops items with relevant_to_city: false', () => {
    const items = [makeItem({ assessment: { relevant_to_city: false, importance: 0.8 } })];
    expect(applyDropLogic(items)).toHaveLength(0);
  });

  it('keeps relevant items and inherits importance', () => {
    const items = [makeItem({ assessment: { relevant_to_city: true, importance: 0.9 } })];
    const result = applyDropLogic(items);
    expect(result).toHaveLength(1);
    expect(result[0].importance).toBe(0.9);
  });

  it('defaults importance to 0.5 when not set', () => {
    const items = [makeItem({ assessment: { relevant_to_city: true } })];
    const result = applyDropLogic(items);
    expect(result).toHaveLength(1);
    expect(result[0].importance).toBe(0.5);
  });

  it('handles mixed bag correctly', () => {
    const items = [
      makeItem({ title: 'No assessment', assessment: undefined }),
      makeItem({ title: 'Irrelevant', assessment: { relevant_to_city: false, importance: 0.8 } }),
      makeItem({ title: 'Relevant high', assessment: { relevant_to_city: true, importance: 0.9 } }),
      makeItem({ title: 'Relevant default', assessment: { relevant_to_city: true } }),
    ];
    const result = applyDropLogic(items);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Relevant high');
    expect(result[0].importance).toBe(0.9);
    expect(result[1].title).toBe('Relevant default');
    expect(result[1].importance).toBe(0.5);
  });
});
