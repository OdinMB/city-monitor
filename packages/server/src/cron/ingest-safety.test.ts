import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createSafetyIngestion, type SafetyReport } from './ingest-safety.js';
import { hashString } from '../lib/hash.js';
import type { GeolocatedReport } from '../lib/openai.js';

vi.mock('../lib/openai.js', () => ({
  geolocateReports: vi.fn().mockResolvedValue(null),
}));

vi.mock('../db/reads.js', () => ({
  loadSafetyGeoState: vi.fn().mockResolvedValue({ coords: new Map(), attempted: new Set() }),
}));

vi.mock('../db/writes.js', () => ({
  saveSafetyReports: vi.fn().mockResolvedValue(undefined),
}));

const HASH_RAUB = hashString('https://www.berlin.de/polizei/polizeimeldungen/1' + 'Raub in Mitte – Täter flüchtig');
const HASH_UNFALL = hashString('https://www.berlin.de/polizei/polizeimeldungen/2' + 'Verkehrsunfall in Kreuzberg');

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
    const { loadSafetyGeoState } = await import('../db/reads.js');

    // Both items already in DB with coordinates
    vi.mocked(loadSafetyGeoState).mockResolvedValue({
      coords: new Map([
        [HASH_RAUB, { lat: 52.52, lon: 13.40, label: 'Mitte' }],
        [HASH_UNFALL, { lat: 52.50, lon: 13.41, label: 'Kreuzberg' }],
      ]),
      attempted: new Set(),
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
    const { loadSafetyGeoState } = await import('../db/reads.js');

    // Only item 1 already in DB with coordinates; item 2 is new
    vi.mocked(loadSafetyGeoState).mockResolvedValue({
      coords: new Map([[HASH_RAUB, { lat: 52.52, lon: 13.40, label: 'Mitte' }]]),
      attempted: new Set(),
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

describe('ingest-safety — attempted-without-location marker', () => {
  const mockDb = {} as Parameters<typeof createSafetyIngestion>[1];

  async function runWith(stored: { attempted: string[] }, geoResult: GeolocatedReport[] | null) {
    const { geolocateReports } = await import('../lib/openai.js');
    const { loadSafetyGeoState } = await import('../db/reads.js');
    const { saveSafetyReports } = await import('../db/writes.js');

    vi.mocked(loadSafetyGeoState).mockResolvedValue({ coords: new Map(), attempted: new Set(stored.attempted) });
    vi.mocked(geolocateReports).mockResolvedValue(geoResult);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(mockPoliceFeedXml, { status: 200 }));

    await createSafetyIngestion(createCache(), mockDb)();

    const savedAttempted = vi.mocked(saveSafetyReports).mock.calls[0]?.[3];
    return { geolocateReports: vi.mocked(geolocateReports), savedAttempted: [...(savedAttempted ?? [])].sort() };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('does not re-send reports already marked as attempted', async () => {
    const { geolocateReports } = await runWith({ attempted: [HASH_RAUB] }, []);
    expect(geolocateReports).toHaveBeenCalledTimes(1);
    expect(geolocateReports.mock.calls[0]![2].map((r) => r.title)).toEqual(['Verkehrsunfall in Kreuzberg']);
  });

  it('marks reports that a successful call left without a location', async () => {
    // needsGeo = [Raub, Unfall]; only Raub gets coordinates
    const { savedAttempted } = await runWith({ attempted: [] }, [
      { index: 0, lat: 52.52, lon: 13.40, locationLabel: 'Mitte' },
      { index: 1, locationLabel: 'Nirgendwo' },
    ]);
    expect(savedAttempted).toEqual([HASH_UNFALL]);
  });

  it('marks nothing new when the call fails', async () => {
    const { savedAttempted } = await runWith({ attempted: [] }, null);
    expect(savedAttempted).toEqual([]);
  });

  it('carries previously attempted hashes forward', async () => {
    const { savedAttempted } = await runWith({ attempted: [HASH_RAUB] }, null);
    expect(savedAttempted).toEqual([HASH_RAUB]);
  });

  it('skips the LLM entirely when every unplaced report was already attempted', async () => {
    const { geolocateReports, savedAttempted } = await runWith({ attempted: [HASH_RAUB, HASH_UNFALL] }, null);
    expect(geolocateReports).not.toHaveBeenCalled();
    expect(savedAttempted).toEqual([HASH_RAUB, HASH_UNFALL].sort());
  });
});
