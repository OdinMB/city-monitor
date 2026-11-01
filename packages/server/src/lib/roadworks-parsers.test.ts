import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  activeWindow, koelnLayerUrl, muenchenUrl, parseGermanDay, parseHamburgRoadworks, parseKoelnRoadworks,
  parseMuenchenRoadworks, parseVizBerlin, polygonCentroid, utm32ToLonLat, MUENCHEN_CQL_FILTER,
} from './roadworks-parsers.js';

/** Features recorded from each provider on 2026-11-01, trimmed to a few. */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./roadworks-fixtures/${name}.json`, import.meta.url), 'utf8'));
}

/** Noon in Berlin on the day the fixtures were recorded. */
const NOW = new Date('2026-11-01T11:00:00Z');

describe('parseGermanDay', () => {
  it('reads dotted and dashed dates, with or without a time', () => {
    expect(parseGermanDay('31.12.2026')).toBe('2026-12-31');
    expect(parseGermanDay('13-04-2026')).toBe('2026-04-13');
    expect(parseGermanDay('31.12.2026 23:59')).toBe('2026-12-31');
  });

  it('gives null for anything else', () => {
    expect(parseGermanDay('Beginn vor mehr als einem Jahr')).toBeNull();
    expect(parseGermanDay(null)).toBeNull();
    expect(parseGermanDay('')).toBeNull();
  });
});

describe('activeWindow', () => {
  it('keeps a site running today, including one ending today', () => {
    expect(activeWindow('2026-10-01', '2026-11-01', NOW)).toEqual({ isFuture: false });
  });

  it('drops a site that ended yesterday', () => {
    expect(activeWindow('2026-10-01', '2026-10-31', NOW)).toBeNull();
  });

  it('keeps a site starting within two weeks as future, and drops a later one', () => {
    expect(activeWindow('2026-11-15', '2026-12-01', NOW)).toEqual({ isFuture: true });
    expect(activeWindow('2026-11-16', '2026-12-01', NOW)).toBeNull();
  });

  it('counts days in Berlin time', () => {
    // 23:30 UTC on 31 October is already 1 November in Berlin
    expect(activeWindow('2026-10-01', '2026-10-31', new Date('2026-10-31T23:30:00Z'))).toBeNull();
  });

  it('treats a missing start as begun', () => {
    expect(activeWindow(null, '2026-12-31', NOW)).toEqual({ isFuture: false });
  });
});

describe('parseVizBerlin', () => {
  const viz = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [13.4, 52.52] }, properties: { id: 7, subtype: 'Baustelle', street: 'Friedrichstraße', content: 'Kanalsanierung', is_future: false, validity: { from: '01.03.2026 06:00', to: null } } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [13.4, 52.52] }, properties: { id: 8, subtype: 'Unfall', street: 'A', content: '', is_future: false } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [13.4, 52.52] }, properties: { id: 9, subtype: 'Neu', street: 'B', content: '', is_future: false } },
    ],
  };

  it('maps subtypes, drops accidents and reports unknown subtypes', () => {
    const warnings: string[] = [];
    const sites = parseVizBerlin(viz, (m) => warnings.push(m));
    expect(sites).toEqual([{
      id: '7', subtype: 'construction', street: 'Friedrichstraße', section: undefined, description: 'Kanalsanierung',
      direction: undefined, validFrom: '01.03.2026 06:00', validUntil: undefined, isFuture: false,
      geometry: { type: 'Point', coordinates: [13.4, 52.52] },
    }]);
    expect(warnings).toEqual(['unknown VIZ subtype "Neu"']);
  });
});

describe('parseHamburgRoadworks', () => {
  it('maps the recorded features to construction sites', () => {
    const sites = parseHamburgRoadworks(fixture('hamburg'), NOW);
    expect(sites).toHaveLength(3);
    expect(sites[0]).toEqual({
      id: 'hh-336810',
      subtype: 'construction',
      street: 'Billstraße, Gustav-Kunst-Straße, Großmannstr. / Abwasser',
      section: 'HAMBURG WASSER',
      description: 'Restarbeiten in Großmannstraße Höhe Hausnr. 237 vom 02.11.2026 bis 20.11.2026 mit einer Fahrspur je Richtung.',
      validFrom: '27.03.2023',
      validUntil: '30.11.2026',
      isFuture: false,
      geometry: { type: 'Point', coordinates: [10.056955, 53.536266] },
    });
  });

  it('clips long descriptions', () => {
    const long = parseHamburgRoadworks(fixture('hamburg'), NOW).find((s) => s.id === 'hh-4093868')!;
    expect(long.description.length).toBeLessThanOrEqual(400);
    expect(long.description.endsWith('…')).toBe(true);
  });

  it('drops sites that are over and flags those about to start', () => {
    const later = parseHamburgRoadworks(fixture('hamburg'), new Date('2026-11-10T11:00:00Z'));
    expect(later.map((s) => s.id)).toEqual(['hh-336810', 'hh-4093868']);
    const earlier = parseHamburgRoadworks(fixture('hamburg'), new Date('2026-10-20T11:00:00Z'));
    expect(earlier.find((s) => s.id === 'hh-4088992')?.isFuture).toBe(true);
  });

  it('survives an empty or malformed body', () => {
    expect(parseHamburgRoadworks({ type: 'FeatureCollection', features: [] }, NOW)).toEqual([]);
    expect(parseHamburgRoadworks(null, NOW)).toEqual([]);
    expect(parseHamburgRoadworks({ features: [{ type: 'Feature', geometry: null, properties: {} }] }, NOW)).toEqual([]);
  });
});

describe('utm32ToLonLat', () => {
  it('puts the central meridian at 9° E', () => {
    const [lon, lat] = utm32ToLonLat(500_000, 5_645_000);
    expect(lon).toBeCloseTo(9, 6);
    expect(lat).toBeGreaterThan(50.9);
    expect(lat).toBeLessThan(51.0);
  });

  it('places a Köln address where OpenStreetMap has it (within about 100 m)', () => {
    // Vogelsanger Str. 64, 50823 Köln: 50.94501, 6.92271 in Nominatim
    const [lon, lat] = utm32ToLonLat(354061.0, 5645748.0);
    expect(Math.abs(lat - 50.94501)).toBeLessThan(0.001);
    expect(Math.abs(lon - 6.92271)).toBeLessThan(0.0015);
  });
});

describe('koelnLayerUrl', () => {
  it('asks for one layer as GeoJSON', () => {
    const url = new URL(koelnLayerUrl('https://geoportal.stadt-koeln.de/wss/service/baustellen_wfs/guest', 'notfall'));
    expect(url.searchParams.get('typeNames')).toBe('ms:notfall');
    expect(url.searchParams.get('request')).toBe('GetFeature');
    expect(url.searchParams.get('outputFormat')).toBe('application/json; subtype=geojson');
  });
});

describe('parseKoelnRoadworks', () => {
  it('maps a layer, converting coordinates and marking the period as a permit', () => {
    const sites = parseKoelnRoadworks(fixture('koeln-strassenbauarbeiten'), 'strassenbauarbeiten', NOW);
    expect(sites).toHaveLength(2);
    const [first] = sites;
    expect(first).toMatchObject({
      subtype: 'construction',
      street: 'L 84/ Kennedystr.',
      section: 'Straßenbauarbeiten',
      description: '',
      validFrom: '13.10.2025',
      validUntil: '31.07.2029',
      validity: 'permit',
      isFuture: false,
    });
    const [lon, lat] = first!.geometry.coordinates as number[];
    expect(lon).toBeGreaterThan(6.77);
    expect(lon).toBeLessThan(7.17);
    expect(lat).toBeGreaterThan(50.83);
    expect(lat).toBeLessThan(51.09);
  });

  it('treats emergency works as disruptions and keeps a permit listed twice at one point once', () => {
    const sites = parseKoelnRoadworks(fixture('koeln-notfall'), 'notfall', NOW);
    expect(sites).toHaveLength(2);
    expect(sites.every((s) => s.subtype === 'disruption')).toBe(true);
    expect(new Set(sites.map((s) => s.id)).size).toBe(2);
  });

  it('drops permits that have run out', () => {
    expect(parseKoelnRoadworks(fixture('koeln-notfall'), 'notfall', new Date('2027-02-01T11:00:00Z'))).toHaveLength(1);
  });
});

describe('München', () => {
  it('filters on the server for construction works on the carriageway', () => {
    const url = new URL(muenchenUrl('https://geoportal.muenchen.de/geoserver/mor_wfs/ows?service=WFS&typeName=mor_wfs:baustellen_opendata'));
    expect(url.searchParams.get('CQL_FILTER')).toBe(MUENCHEN_CQL_FILTER);
    expect(url.searchParams.get('typeName')).toBe('mor_wfs:baustellen_opendata');
    expect(MUENCHEN_CQL_FILTER).toContain("art='Baumaßnahme'");
    expect(MUENCHEN_CQL_FILTER).toContain("beeintraechtigung ILIKE '%fahrbahn%'");
  });

  it('reduces a polygon to the centroid of its largest part', () => {
    const square = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] };
    expect(polygonCentroid(square)).toEqual({ type: 'Point', coordinates: [1, 1] });
    const multi = { type: 'MultiPolygon', coordinates: [[[[10, 10], [10.1, 10], [10.1, 10.1], [10, 10]]], [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]]]] };
    expect(polygonCentroid(multi)).toEqual({ type: 'Point', coordinates: [2, 2] });
    expect(polygonCentroid({ type: 'Polygon', coordinates: [] })).toBeNull();
  });

  it('maps the recorded features to points', () => {
    const sites = parseMuenchenRoadworks(fixture('muenchen'), NOW);
    expect(sites.map((s) => s.id)).toEqual(['m-6', 'm-17', 'm-326']);
    expect(sites[0]).toMatchObject({
      subtype: 'construction', // "Zeitweise Vollsperre" is not a full closure
      street: 'Augustenstraße 53 - 95',
      section: 'Bauabschnitt 2026',
      description: 'Radweg verengt, Fahrbahn verengt, Einbahnregelung in Richtung Süden, Zeitweise Vollsperre',
      validFrom: '09.03.2026',
      validUntil: '31.12.2026',
      isFuture: false,
    });
    expect(sites[0]!.geometry.type).toBe('Point');
    const [lon, lat] = sites[0]!.geometry.coordinates as number[];
    expect(lon).toBeCloseTo(11.5636, 3);
    expect(lat).toBeCloseTo(48.1501, 3);
  });

  it('reads a start "more than a year ago" and an end with a time', () => {
    const site = parseMuenchenRoadworks(fixture('muenchen'), NOW).find((s) => s.id === 'm-326')!;
    expect(site.validFrom).toBeUndefined();
    expect(site.validUntil).toBe('31.12.2026');
    expect(site.isFuture).toBe(false);
  });

  it('flags a site starting within two weeks', () => {
    expect(parseMuenchenRoadworks(fixture('muenchen'), NOW).find((s) => s.id === 'm-17')?.isFuture).toBe(true);
  });

  it('calls a plain full closure a closure', () => {
    const closed = { features: [{ type: 'Feature', id: 'baustellen_opendata.9', geometry: { type: 'Polygon', coordinates: [[[11.5, 48.1], [11.6, 48.1], [11.6, 48.2], [11.5, 48.1]]] }, properties: { strasse_hausnr: 'X', beeintraechtigung: 'Vollsperre', beginn_datum_kombiniert: '01.10.2026', ende_datum_kombiniert: '01.12.2026' } }] };
    expect(parseMuenchenRoadworks(closed, NOW)[0]?.subtype).toBe('closure');
    const half = { features: [{ ...closed.features[0], properties: { ...closed.features[0]!.properties, beeintraechtigung: 'halbseitige Straßensperrung' } }] };
    expect(parseMuenchenRoadworks(half, NOW)[0]?.subtype).toBe('construction');
  });
});
