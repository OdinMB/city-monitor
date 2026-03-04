import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createSafetyIngestion, type SafetyReport } from './ingest-safety.js';
import { hashString } from '../lib/hash.js';

vi.mock('../lib/openai.js', () => ({
  geolocateReports: vi.fn().mockResolvedValue(null),
}));

vi.mock('../db/reads.js', () => ({
  loadSafetyReports: vi.fn().mockResolvedValue(null),
}));

const mockPoliceFeedXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Polizeimeldungen</title>
    <item>
      <title>Raub in Mitte – Täter flüchtig</title>
      <link>https://www.berlin.de/polizei/polizeimeldungen/1</link>
      <pubDate>Sun, 01 Mar 2026 10:00:00 GMT</pubDate>
      <description>Am Samstag wurde ein Mann beraubt.</description>
    </item>
    <item>
      <title>Verkehrsunfall in Kreuzberg</title>
      <link>https://www.berlin.de/polizei/polizeimeldungen/2</link>
      <pubDate>Sun, 01 Mar 2026 08:00:00 GMT</pubDate>
      <description>Bei einem Unfall wurden zwei Personen verletzt.</description>
    </item>
  </channel>
</rss>`;

describe('ingest-safety', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches police RSS and writes SafetyReport[] to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockPoliceFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createSafetyIngestion(cache);
    await ingest();

    const reports = cache.get<SafetyReport[]>('berlin:safety:recent');
    expect(reports).toBeTruthy();
    expect(reports!.length).toBe(2);
    expect(reports![0].title).toContain('Raub');
  });

  it('extracts district from title', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockPoliceFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createSafetyIngestion(cache);
    await ingest();

    const reports = cache.get<SafetyReport[]>('berlin:safety:recent')!;
    const mitteReport = reports.find((r) => r.title.includes('Mitte'));
    expect(mitteReport?.district).toBe('Mitte');

    const kreuzbergReport = reports.find((r) => r.title.includes('Kreuzberg'));
    expect(kreuzbergReport?.district).toBe('Kreuzberg');
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createSafetyIngestion(cache);
    await ingest(); // should not throw

    const reports = cache.get<SafetyReport[]>('berlin:safety:recent');
    expect(reports).toBeNull();
  });
});

describe('ingest-safety — DB coordinate reuse', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('carries over coordinates from DB and skips geocoding for known items', async () => {
    const { geolocateReports } = await import('../lib/openai.js');
    const { loadSafetyReports } = await import('../db/reads.js');

    const hash1 = hashString('https://www.berlin.de/polizei/polizeimeldungen/1' + 'Raub in Mitte – Täter flüchtig');
    const hash2 = hashString('https://www.berlin.de/polizei/polizeimeldungen/2' + 'Verkehrsunfall in Kreuzberg');

    // Both items already in DB with coordinates
    vi.mocked(loadSafetyReports).mockResolvedValue({
      data: [
        {
          id: hash1,
          title: 'Raub in Mitte – Täter flüchtig',
          description: 'Am Samstag wurde ein Mann beraubt.',
          publishedAt: '2026-03-01T10:00:00.000Z',
          url: 'https://www.berlin.de/polizei/polizeimeldungen/1',
          district: 'Mitte',
          location: { lat: 52.52, lon: 13.40, label: 'Mitte' },
        },
        {
          id: hash2,
          title: 'Verkehrsunfall in Kreuzberg',
          description: 'Bei einem Unfall wurden zwei Personen verletzt.',
          publishedAt: '2026-03-01T08:00:00.000Z',
          url: 'https://www.berlin.de/polizei/polizeimeldungen/2',
          district: 'Kreuzberg',
          location: { lat: 52.50, lon: 13.41, label: 'Kreuzberg' },
        },
      ],
      fetchedAt: new Date(),
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockPoliceFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const mockDb = {} as Parameters<typeof createSafetyIngestion>[1];
    const ingest = createSafetyIngestion(cache, mockDb);
    await ingest();

    // geolocateReports should NOT be called — all items already have coords
    expect(geolocateReports).not.toHaveBeenCalled();

    // Cached reports should have the carried-over coordinates
    const reports = cache.get<SafetyReport[]>('berlin:safety:recent')!;
    expect(reports).toBeTruthy();
    const mitteReport = reports.find((r) => r.title.includes('Mitte'));
    expect(mitteReport?.location).toEqual({ lat: 52.52, lon: 13.40, label: 'Mitte' });
  });

  it('geocodes only new items when some already have DB coordinates', async () => {
    const { geolocateReports } = await import('../lib/openai.js');
    const { loadSafetyReports } = await import('../db/reads.js');

    const hash1 = hashString('https://www.berlin.de/polizei/polizeimeldungen/1' + 'Raub in Mitte – Täter flüchtig');

    // Only item 1 already in DB with coordinates; item 2 is new
    vi.mocked(loadSafetyReports).mockResolvedValue({
      data: [
        {
          id: hash1,
          title: 'Raub in Mitte – Täter flüchtig',
          description: 'Am Samstag wurde ein Mann beraubt.',
          publishedAt: '2026-03-01T10:00:00.000Z',
          url: 'https://www.berlin.de/polizei/polizeimeldungen/1',
          district: 'Mitte',
          location: { lat: 52.52, lon: 13.40, label: 'Mitte' },
        },
      ],
      fetchedAt: new Date(),
    });

    // geolocateReports returns coords for the one new item (index 0 of the subset passed)
    vi.mocked(geolocateReports).mockResolvedValue([
      { index: 0, lat: 52.50, lon: 13.41, locationLabel: 'Kreuzberg' },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(mockPoliceFeedXml, { status: 200 }),
    );

    const cache = createCache();
    const mockDb = {} as Parameters<typeof createSafetyIngestion>[1];
    const ingest = createSafetyIngestion(cache, mockDb);
    await ingest();

    // geolocateReports should be called with only the 1 new item
    expect(geolocateReports).toHaveBeenCalledTimes(1);
    const passedReports = vi.mocked(geolocateReports).mock.calls[0][2];
    expect(passedReports).toHaveLength(1);
    expect(passedReports[0].title).toBe('Verkehrsunfall in Kreuzberg');

    // Both items should have coordinates in the cache
    const reports = cache.get<SafetyReport[]>('berlin:safety:recent')!;
    expect(reports).toBeTruthy();
    for (const r of reports) {
      expect(r.location).toBeTruthy();
      expect(r.location!.lat).toBeDefined();
      expect(r.location!.lon).toBeDefined();
    }
  });
});
