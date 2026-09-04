import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createBathingIngestion } from './ingest-bathing.js';
import type { BathingSpot } from '@city-monitor/shared';

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
  });

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
