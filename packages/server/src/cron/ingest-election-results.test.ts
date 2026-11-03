import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElectionResults } from '@city-monitor/shared';
import { createCache } from '../lib/cache.js';
import type { Db } from '../db/index.js';
import { createElectionResultsIngestion, electionGeojson, type ElectionSnapshot } from './ingest-election-results.js';
import { muenchen } from '../config/cities/muenchen.js';

const mockSave = vi.fn().mockResolvedValue(undefined);
vi.mock('../db/writes.js', () => ({
  saveElectionResults: (...args: unknown[]) => mockSave(...args),
}));

/** A ZIP with one stored (uncompressed) member, enough for lib/zip.ts (which does not check the CRC). */
function storedZip(name: string, content: string): Uint8Array {
  const nameBuf = Buffer.from(name, 'utf8');
  const data = Buffer.from(content, 'utf8');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  const centralOffset = local.length + nameBuf.length + data.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + nameBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  return new Uint8Array(Buffer.concat([local, nameBuf, data, central, nameBuf, eocd]));
}

const CSV = [
  'Gebietsartschlüssel;Gebietsnummer;Stimmbezirksart;Wahlberechtigte gesamt;Wähler gesamt;Ungültige Stimmen;Partei;Anzahl Stimmen;Prozentzahl;Partei;Anzahl Stimmen;Prozentzahl',
  'SRSB;1;1;15649;8786;199;CSU;100;40 %;GRÜNE;150;60 %',
  'SRSB;2;1;37491;21677;406;CSU;300;60 %;GRÜNE;200;40 %',
].join('\n');

const URL = muenchen.dataSources.electionResults!.url;

describe('createElectionResultsIngestion', () => {
  beforeEach(() => mockSave.mockClear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('reads München\'s Stadtrat result and stores it with the Stadtbezirk polygons', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'koeln,muenchen');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) =>
      String(input) === URL ? new Response(Buffer.from(storedZip('srw.stadtbezirke.stimmen.csv', CSV))) : new Response('', { status: 404 }));
    const cache = createCache();
    const db = {} as Db;
    await createElectionResultsIngestion(cache, db)();

    // Köln has no election source: nothing fetched for it
    expect(fetchSpy.mock.calls.map(([u]) => String(u))).toEqual([URL]);
    const results = cache.get<ElectionResults>('muenchen:election-results')!;
    expect(results).toMatchObject({ election: 'stadtrat', date: '2026-03-08', areaLevel: 'stadtbezirk' });
    expect(results.areas.map((a) => [a.id, a.name, a.leader])).toEqual([['01', 'Altstadt-Lehel', 'Grüne'], ['02', 'Ludwigsvorstadt-Isarvorstadt', 'CSU']]);
    expect(results.total).toMatchObject({ leader: 'CSU', eligible: 53140, voters: 30463 });
    const geojson = cache.get<ElectionSnapshot['geojson']>('muenchen:election-results:geojson')!;
    expect(geojson.features.map((f) => f.properties)).toEqual([
      { id: '01', name: 'Altstadt-Lehel', leader: 'Grüne', leaderPct: 60 },
      { id: '02', name: 'Ludwigsvorstadt-Isarvorstadt', leader: 'CSU', leaderPct: 60 },
    ]);
    expect(mockSave).toHaveBeenCalledWith(db, 'muenchen', { results, geojson });
    expect(cache.get('koeln:election-results')).toBeNull();
  });

  it('keeps the previous result when the file is unreadable', async () => {
    vi.stubEnv('ACTIVE_CITIES', 'muenchen');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>moved</html>'));
    const cache = createCache();
    cache.set('muenchen:election-results', { kept: true }, 60);
    await createElectionResultsIngestion(cache, null)();
    expect(cache.get('muenchen:election-results')).toEqual({ kept: true });
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe('electionGeojson', () => {
  it('draws a group of Stadtteile on each of its outlines and leaves areas without one off the map', () => {
    const area = { turnout: 50, shares: [{ party: 'SPD', pct: 40 }], otherPct: 60, leader: 'SPD' };
    const results = {
      areas: [{ ...area, id: '115+116', name: 'Billbrook/Rothenburgsort' }, { ...area, id: '999', name: 'Gone' }],
    } as ElectionResults;
    const outlines = new Map([
      ['115', { id: '115', geometry: { type: 'Polygon', coordinates: [] } }],
      ['116', { id: '116', geometry: { type: 'Polygon', coordinates: [] } }],
    ]);
    const features = electionGeojson(results, outlines).features;
    expect(features).toHaveLength(2);
    expect(features.every((f) => f.properties.id === '115+116' && f.properties.leaderPct === 40)).toBe(true);
  });
});
