import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createBathingIngestion, hamburgBathingUrl, parseHamburgBathing } from './ingest-bathing.js';
import type { BathingSpot } from '@city-monitor/shared';
import type { Db } from '../db/index.js';

// Recorded from HH_WFS_Badegewaesser on 2026-11-02, trimmed to five spots
// (one closed, one with a ban, one with a warning, two clean) and their
// samples since 10 August.
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown;
const HH_SPOTS = fixture('hh-badegewaesser.json');
const HH_SAMPLES = fixture('hh-badegewaesser-proben.json');

const mockSaveBathingSpots = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveBathingSpots: (...args: unknown[]) => mockSaveBathingSpots(...args),
}));

const GOOD_ROW = [
  'Strandbad Wannsee', 'Steglitz-Zehlendorf', 'Unterhavel', 'Strandbad Wannsee',
  '52.438898', '13.176804',
  '""link""', 'https://www.berlin.de/lageso/badestellen/wannsee.php',
  '16.09.2025', '1', '<15', '<15', 'gruen.jpg', 'B350', 'NA', '1', '<300', '18.7',
  '""pdf""', '', '1', 'keine', 'keine',
  'nicht zutreffend', '0', '1', 'NA', 'NA', 'NA', 'NA', 'NA', 'ausgezeichnet',
].join(';');

const WARNING_ROW = [
  'Kleine Badewiese', 'Spandau', 'Unterhavel', 'Kleine Badewiese',
  '52.484177', '13.18595',
  '""link""', 'https://www.berlin.de/lageso/badestellen/badewiese.php',
  '15.09.2025', '< 1', '110', '30', 'gelb_prog.jpg', 'B329', 'NA', '13', '<300', '18.5',
  '""pdf""', '""prog""', '13',
  'Blaualgenmassenentwicklungen',
  'Kontakt zu sichtbaren Algenteppichen vermeiden.',
  'gut', '2026-02-20', '13',
  '1.17', '1.88', '2.49', '2.76', '2.77', 'gut',
].join(';');

const POOR_ROW = [
  'Schmöckwitz', 'Treptow-Köpenick', 'Dahme', 'Schmöckwitz',
  '52.373237', '13.653285',
  '""link""', 'https://www.berlin.de/lageso/badestellen/schmoeckwitz.php',
  '08.09.2025', '0.4', '15', '<15', 'rot.jpg', 'B215', 'NA', '5', '<300', '20.5',
  '""pdf""', '', '5',
  'Blaualgenmassenentwicklungen und sehr geringe Sichttiefen',
  'Baden nicht empfohlen.',
  'nicht zutreffend', '0', '5', 'NA', 'NA', 'NA', 'NA', 'NA', 'NA',
].join(';');

const HEADER = 'BadName;Bezirk;Profil;RSS_Name;Latitude;Longitude;ProfilLink;BadestelleLink;Dat;Sicht;Eco;Ente;Farbe;BSL;Algen;Wasserqualitaet;cb;Temp;PDFLink;PrognoseLink;Farb_ID;Bemerkung;Weitere_Hinweise;Wasserqualitaet_predict;Dat_predict;Wasserqualitaet_lageso;p2_5;p50;p90;p95;p97_5;classification';

function buildCsv(...rows: string[]): string {
  return [HEADER, ...rows].join('\n');
}

describe('ingest-bathing', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSaveBathingSpots.mockClear();
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('makes no request and writes nothing when no active city has a bathing source', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln,muenchen');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(GOOD_ROW), { status: 200 }),
    );

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    await createBathingIngestion(cache, {} as Db)();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setSpy).not.toHaveBeenCalled();
    expect(mockSaveBathingSpots).not.toHaveBeenCalled();
  });

  it.each(['berlin', 'berlin,koeln', 'koeln,berlin'])(
    'fetches the LAGeSo CSV and writes Berlin rows when ACTIVE_CITIES=%s',
    async (activeCities) => {
      vi.stubEnv('ACTIVE_CITIES', activeCities);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(buildCsv(GOOD_ROW), { status: 200 }),
      );

      const cache = createCache();
      const setSpy = vi.spyOn(cache, 'set');
      const db = {} as Db;
      await createBathingIngestion(cache, db)();

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(fetchSpy.mock.calls[0]![0]).toBe('https://data.lageso.de/baden/0_letzte/letzte.csv');
      expect(setSpy).toHaveBeenCalledTimes(1);
      expect(setSpy).toHaveBeenCalledWith('berlin:bathing:spots', expect.any(Array), 86400);
      expect(mockSaveBathingSpots).toHaveBeenCalledTimes(1);
      expect(mockSaveBathingSpots).toHaveBeenCalledWith(db, 'berlin', setSpy.mock.calls[0]![1]);
    },
  );

  it('fetches CSV and writes BathingSpot[] to cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(GOOD_ROW), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest();

    const spots = cache.get<BathingSpot[]>('berlin:bathing:spots');
    expect(spots).toBeTruthy();
    expect(spots!.length).toBe(1);
  });

  it('maps CSV fields to BathingSpot correctly', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(GOOD_ROW), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest();

    const spots = cache.get<BathingSpot[]>('berlin:bathing:spots')!;
    const spot = spots[0];

    expect(spot.id).toBe('bath-B350');
    expect(spot.name).toBe('Strandbad Wannsee');
    expect(spot.district).toBe('Steglitz-Zehlendorf');
    expect(spot.waterBody).toBe('Unterhavel');
    expect(spot.lat).toBe(52.438898);
    expect(spot.lon).toBe(13.176804);
    expect(spot.measuredAt).toBe('2025-09-16');
    expect(spot.waterTemp).toBe(18.7);
    expect(spot.visibility).toBe(1);
    expect(spot.quality).toBe('good');
    expect(spot.algae).toBeNull();
    expect(spot.advisory).toBeNull();
    expect(spot.classification).toBe('ausgezeichnet');
    expect(spot.detailUrl).toBe('https://www.berlin.de/lageso/badestellen/wannsee.php');
  });

  it('maps Farb_ID 1/11 to good, 3/13 to warning, 5 to poor', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(GOOD_ROW, WARNING_ROW, POOR_ROW), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest();

    const spots = cache.get<BathingSpot[]>('berlin:bathing:spots')!;
    expect(spots.find(s => s.id === 'bath-B350')!.quality).toBe('good');
    expect(spots.find(s => s.id === 'bath-B329')!.quality).toBe('warning');
    expect(spots.find(s => s.id === 'bath-B215')!.quality).toBe('poor');
  });

  it('treats "keine" and "NA" algae/advisory as null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(GOOD_ROW), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest();

    const spot = cache.get<BathingSpot[]>('berlin:bathing:spots')![0];
    expect(spot.algae).toBeNull();
    expect(spot.advisory).toBeNull();
  });

  it('preserves algae and advisory text when present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(WARNING_ROW), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest();

    const spot = cache.get<BathingSpot[]>('berlin:bathing:spots')![0];
    expect(spot.algae).toBe('Blaualgenmassenentwicklungen');
    expect(spot.advisory).toBe('Kontakt zu sichtbaren Algenteppichen vermeiden.');
  });

  it('parses visibility with "< " prefix', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(WARNING_ROW), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest();

    const spot = cache.get<BathingSpot[]>('berlin:bathing:spots')![0];
    expect(spot.visibility).toBe(1);
  });

  it('handles fetch failure gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 500 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest(); // should not throw

    const spots = cache.get<BathingSpot[]>('berlin:bathing:spots');
    expect(spots).toBeNull();
  });

  it('handles empty CSV (header only) without error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(HEADER, { status: 200 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest();

    const spots = cache.get<BathingSpot[]>('berlin:bathing:spots');
    expect(spots).toEqual([]);
  });

  it('uses 24h TTL for cache entry', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(GOOD_ROW), { status: 200 }),
    );

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    const ingest = createBathingIngestion(cache);
    await ingest();

    expect(setSpy).toHaveBeenCalledWith(
      'berlin:bathing:spots',
      expect.any(Array),
      86400,
    );
  });

  // Season runs 15 May – 15 Sep, so the clock is pinned rather than left to
  // whenever the suite happens to run.
  it.each([
    ['2026-07-01T12:00:00Z', true],
    ['2026-03-01T12:00:00Z', false],
  ])('sets inSeason from the current date (%s → %s)', async (now, expected) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(now));
    try {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(buildCsv(GOOD_ROW), { status: 200 }),
      );

      const cache = createCache();
      const ingest = createBathingIngestion(cache);
      await ingest();

      const spot = cache.get<BathingSpot[]>('berlin:bathing:spots')![0];
      expect(spot.inSeason).toBe(expected);
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips rows with missing coordinates', async () => {
    const badRow = GOOD_ROW.replace('52.438898', '').replace('13.176804', '');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(badRow, WARNING_ROW), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest();

    const spots = cache.get<BathingSpot[]>('berlin:bathing:spots')!;
    expect(spots.length).toBe(1);
    expect(spots[0].id).toBe('bath-B329');
  });

  it('fetches each city from its own provider and stores it under that city', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin,hamburg');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('lageso')) return new Response(buildCsv(GOOD_ROW), { status: 200 });
      return new Response(JSON.stringify(url.includes('badegewaesser_proben') ? HH_SAMPLES : HH_SPOTS), { status: 200 });
    });

    const cache = createCache();
    const db = {} as Db;
    await createBathingIngestion(cache, db)();

    expect(fetchSpy.mock.calls.map(([u]) => String(u)).sort()).toEqual([
      'https://data.lageso.de/baden/0_letzte/letzte.csv',
      hamburgBathingUrl('https://geodienste.hamburg.de/HH_WFS_Badegewaesser', 'badegewaesser'),
      hamburgBathingUrl('https://geodienste.hamburg.de/HH_WFS_Badegewaesser', 'badegewaesser_proben'),
    ].sort());
    expect(cache.get<BathingSpot[]>('berlin:bathing:spots')).toHaveLength(1);
    expect(cache.get<BathingSpot[]>('hamburg:bathing:spots')).toHaveLength(5);
    expect(mockSaveBathingSpots.mock.calls.map((c) => c[1]).sort()).toEqual(['berlin', 'hamburg']);
  });

  it('keeps Hamburg\'s previous spots when one of its two requests fails', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'hamburg');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input).includes('badegewaesser_proben')
        ? new Response('', { status: 503 })
        : new Response(JSON.stringify(HH_SPOTS), { status: 200 }));

    const cache = createCache();
    const setSpy = vi.spyOn(cache, 'set');
    await createBathingIngestion(cache, {} as Db)();

    expect(setSpy).not.toHaveBeenCalled();
    expect(mockSaveBathingSpots).not.toHaveBeenCalled();
  });

  it('parses German date DD.MM.YYYY to ISO YYYY-MM-DD', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(buildCsv(GOOD_ROW), { status: 200 }),
    );

    const cache = createCache();
    const ingest = createBathingIngestion(cache);
    await ingest();

    const spot = cache.get<BathingSpot[]>('berlin:bathing:spots')![0];
    expect(spot.measuredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseHamburgBathing', () => {
  const SUMMER = new Date('2026-08-20T10:00:00Z');
  const spots = parseHamburgBathing(HH_SPOTS, HH_SAMPLES, SUMMER)!;
  const byName = (name: string) => spots.find((s) => s.name === name)!;

  it('builds one spot per point of the spot layer, in its order', () => {
    expect(spots.map((s) => s.name)).toEqual([
      'Sommerbad Volksdorf', 'Eichbaumsee, Badestelle Nord', 'Eichbaumsee, Badestelle Ost',
      'Naturbad Stadtparksee', 'Öjendorfer See, Badestelle Nord',
    ]);
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
  });

  it('takes the newest sample of each spot, whatever order the samples come in', () => {
    const ost = byName('Eichbaumsee, Badestelle Ost');
    expect(ost.measuredAt).toBe('2026-09-07');
    expect(ost.waterTemp).toBe(18.3);
    expect(ost.visibility).toBe(1);
    expect(ost.advisory).toBe('Baden verboten. Blaualgen (Stand 07.09.26)');
    const oec = byName('Öjendorfer See, Badestelle Nord');
    expect(oec.measuredAt).toBe('2026-08-25');
    expect(oec.waterTemp).toBe(18.3);
  });

  it('rates a ban or a closed spot poor, a remark with "ggf." or few algae good', () => {
    expect(byName('Öjendorfer See, Badestelle Nord').quality).toBe('poor');
    expect(byName('Eichbaumsee, Badestelle Ost').quality).toBe('poor');
    const closed = byName('Eichbaumsee, Badestelle Nord');
    expect(closed.quality).toBe('poor');
    expect(closed.advisory).toBe('Badestelle gesperrt');
    expect(closed.measuredAt).toBe('');
    expect(closed.waterTemp).toBeNull();
    // The sample (17.08) is newer than the spot layer's warning (27.07)
    const volksdorf = byName('Sommerbad Volksdorf');
    expect(volksdorf.quality).toBe('good');
    expect(volksdorf.advisory).toBe('keine Beanstandung, ggf. Blaualgen (Stand 17.08.)');
    expect(volksdorf.algae).toBeNull();
    const stadtpark = byName('Naturbad Stadtparksee');
    expect(stadtpark.quality).toBe('good');
    expect(stadtpark.advisory).toBeNull();
    expect(stadtpark.visibility).toBe(2);
  });

  it('rates a warning, or many algae, as a warning', () => {
    const warned = parseHamburgBathing(HH_SPOTS, { type: 'FeatureCollection', features: [] }, SUMMER)!;
    // Without samples the spot layer's own remark counts
    expect(warned.find((s) => s.name === 'Sommerbad Volksdorf')!.quality).toBe('warning');
    const algae = parseHamburgBathing(HH_SPOTS, {
      features: [{ properties: { name: 'Naturbad Stadtparksee', datum: '20260901', algen: 'viel', bemerkung_bsu: 'keine Beanstandung', icon: 'NNNN' } }],
    }, SUMMER)!.find((s) => s.name === 'Naturbad Stadtparksee')!;
    expect(algae.quality).toBe('warning');
    expect(algae.algae).toBe('Algen: viel');
  });

  it('names the lake as the water body, and none for a pool named after itself', () => {
    expect(byName('Eichbaumsee, Badestelle Ost').waterBody).toBe('Eichbaumsee');
    expect(byName('Sommerbad Volksdorf').waterBody).toBe('');
    expect(byName('Sommerbad Volksdorf').district).toBe('');
  });

  it('links the hamburg.de page over https and keeps the EU class out', () => {
    const s = byName('Naturbad Stadtparksee');
    expect(s.detailUrl).toBe('https://www.hamburg.de/go/naturbad-stadtparksee');
    expect(s.classification).toBeNull();
    expect(s.lat).toBeCloseTo(53.5931, 4);
    expect(s.lon).toBeCloseTo(10.0282, 4);
  });

  it('puts each spot in season by its own dates', () => {
    expect(byName('Sommerbad Volksdorf').inSeason).toBe(true);
    const sept = parseHamburgBathing(HH_SPOTS, HH_SAMPLES, new Date('2026-09-05T10:00:00Z'))!;
    // Volksdorf closed on 31 August, Stadtparksee runs until 14 September
    expect(sept.find((s) => s.name === 'Sommerbad Volksdorf')!.inSeason).toBe(false);
    expect(sept.find((s) => s.name === 'Naturbad Stadtparksee')!.inSeason).toBe(true);
    const winter = parseHamburgBathing(HH_SPOTS, HH_SAMPLES, new Date('2026-11-02T10:00:00Z'))!;
    expect(winter.every((s) => !s.inSeason)).toBe(true);
  });

  it('returns null for a response that is not a feature collection', () => {
    expect(parseHamburgBathing({ error: 'x' }, HH_SAMPLES, SUMMER)).toBeNull();
    expect(parseHamburgBathing(HH_SPOTS, null, SUMMER)).toBeNull();
  });
});
