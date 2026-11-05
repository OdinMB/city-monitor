import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createSafetyIngestion, type SafetyReport } from './ingest-safety.js';

vi.mock('../lib/openai.js', () => ({
  geolocateReports: vi.fn().mockResolvedValue(null),
}));

vi.mock('../db/reads.js', () => ({
  loadSafetyGeoState: vi.fn().mockResolvedValue({ coords: new Map(), attempted: new Set() }),
}));

vi.mock('../db/writes.js', () => ({
  saveSafetyReports: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../config/index.js', () => ({
  getActiveCities: () => [{
    id: 'muenchen',
    name: 'München',
    dataSources: {
      police: { provider: 'polizei-bayern', url: 'https://example.test/feed.xml', minIntervalMinutes: 15 },
    },
  }],
}));

const BULLETIN_1 = 'https://example.test/aktuelles/pressemitteilungen/1/index.html';
const BULLETIN_2 = 'https://example.test/aktuelles/pressemitteilungen/2/index.html';
const SEARCH = 'https://example.test/fahndung/personen/vermisste/3/index.html';

const feedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<item><title>Medieninformation vom 04.11.2026</title><link>${BULLETIN_1}</link><pubDate>Wed, 4 Nov 2026 11:41:00</pubDate></item>
<item><title>Vermisste Person</title><link>${SEARCH}</link><pubDate>Wed, 4 Nov 2026 10:00:00</pubDate></item>
<item><title>Medieninformation vom 03.11.2026</title><link>${BULLETIN_2}</link><pubDate>Tue, 3 Nov 2026 12:35:00</pubDate></item>
</channel></rss>`;

const pages: Record<string, string> = {
  [BULLETIN_1]: '<section><h3><strong>11.&nbsp; Raub &ndash; Milbertshofen</strong></h3><p>Ein Mann wurde beraubt.</p><h3>12. Brand &ndash; Au</h3><p>Ein Keller brannte.</p></section>',
  [BULLETIN_2]: '<section><h3>10. Sachbeschädigung &ndash; Schwabing</h3><p>Ein Auto wurde zerkratzt.</p></section>',
};

describe('ingest-safety — Polizei Bayern bulletins', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T08:00:00Z'));
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url === 'https://example.test/feed.xml') return new Response(feedXml, { status: 200 });
      if (pages[url]) return new Response(pages[url], { status: 200 });
      return new Response('', { status: 404 });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const fetchedUrls = () => fetchSpy.mock.calls.map((c: unknown[]) => String(c[0]));

  it('splits each bulletin into reports, in München time, newest first', async () => {
    const cache = createCache();
    await createSafetyIngestion(cache)();

    const reports = cache.get<SafetyReport[]>('muenchen:safety:recent')!;
    expect(reports.map((r) => [r.title, r.district, r.url])).toEqual([
      ['Raub – Milbertshofen', 'Milbertshofen', BULLETIN_1],
      ['Brand – Au', 'Au', BULLETIN_1],
      ['Sachbeschädigung – Schwabing', 'Schwabing', BULLETIN_2],
    ]);
    expect(reports[0].publishedAt).toBe('2026-11-04T10:41:00.000Z');
  });

  it('never fetches a search page', async () => {
    await createSafetyIngestion(createCache())();
    expect(fetchedUrls()).not.toContain(SEARCH);
  });

  it('reads each bulletin page once and keeps to the 15-minute limit', async () => {
    const ingest = createSafetyIngestion(createCache());
    await ingest();
    expect(fetchedUrls().sort()).toEqual(['https://example.test/feed.xml', BULLETIN_1, BULLETIN_2].sort());

    // Ten minutes later (the cron schedule): too soon, nothing is fetched
    vi.setSystemTime(new Date('2026-11-05T08:10:00Z'));
    await ingest();
    expect(fetchSpy).toHaveBeenCalledTimes(3);

    // Twenty minutes later: the feed again, but not the pages already read
    vi.setSystemTime(new Date('2026-11-05T08:20:00Z'));
    await ingest();
    expect(fetchedUrls().slice(3)).toEqual(['https://example.test/feed.xml']);
  });
});
