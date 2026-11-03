import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchStreetTree, parseFeatureInfo, toStreetTree } from './street-trees.js';

// Trimmed GetFeatureInfo answers of 2026-11-03 (Berlin and Köln dl-de/zero-2.0,
// Hamburg dl-de/by-2.0: Freie und Hansestadt Hamburg, BUKEA).
const BERLIN_JSON = `{"type":"FeatureCollection","features":[{"type":"Feature","id":"strassenbaeume.00008100_0014ffc9",
  "geometry":{"type":"Point","coordinates":[1490692.568653,6894219.420135]},
  "properties":{"PITID":"00008100:0014ffc9","Objektname":"Unter den Linden","Baumart (Deutsch)":"Silber-Linde",
  "Baumart (Botanisch)":"Tilia tomentosa","Gattung (Deutsch)":"Linde","Gattung":"Tilia","Straße":"Unter den Linden",
  "Pflanzjahr":"1985","Standalter":"41.0","Krone Durchmesser in m":"6.0","Stamm Umfang in cm":"104",
  "Baumhöhe in m":"13.0","Bezirk":"Mitte"}}],"numberReturned":1}`;

const BERLIN_PARK_JSON = `{"type":"FeatureCollection","features":[{"type":"Feature","properties":{"Objektname":"Großer Tiergarten",
  "Baumart (Deutsch)":"Holländische Linde","Baumart (Botanisch)":"Tilia intermedia","Pflanzjahr":"1994",
  "Krone Durchmesser in m":"8.0","Stamm Umfang in cm":"81","Baumhöhe in m":"11.0","Bezirk":"Mitte"}}]}`;

const HAMBURG_XML = `<?xml version='1.0' encoding='UTF-8'?>
<FeatureCollection xmlns="http://www.opengis.net/wfs" xmlns:gml="http://www.opengis.net/gml">
  <gml:boundedBy><gml:Box srsName="EPSG:25832"><gml:coordinates>1111948.485,7087461.608 1111948.485,7087461.608</gml:coordinates></gml:Box></gml:boundedBy>
  <gml:featureMember>
    <de.hh.up:strassenbaum xmlns:de.hh.up="https://registry.gdi-de.org/id/de.hh.up" fid="DE.HH.UP_STRASSENBAUM_37856">
      <de.hh.up:baumid>100914160</de.hh.up:baumid>
      <de.hh.up:gattung_latein>Liquidambar</de.hh.up:gattung_latein>
      <de.hh.up:gattung_deutsch>Amberbaum</de.hh.up:gattung_deutsch>
      <de.hh.up:art_latein>Liquidambar styraciflua</de.hh.up:art_latein>
      <de.hh.up:art_deutsch>Amerikanischer Amberbaum</de.hh.up:art_deutsch>
      <de.hh.up:pflanzjahr>2021</de.hh.up:pflanzjahr>
      <de.hh.up:kronendurchmesser>3</de.hh.up:kronendurchmesser>
      <de.hh.up:stammumfang>51</de.hh.up:stammumfang>
      <de.hh.up:strasse>Dag-Hammarskjöld-Platz</de.hh.up:strasse>
      <de.hh.up:stadtteil>St. Pauli</de.hh.up:stadtteil>
    </de.hh.up:strassenbaum>
  </gml:featureMember>
</FeatureCollection>`;

const KOELN_XML = `<?xml version="1.0" encoding="utf-8" ?>
<ogr:FeatureCollection xmlns:ogr="http://ogr.maptools.org/" xmlns:gml="http://www.opengis.net/gml/3.2">
  <gml:boundedBy><gml:Null /></gml:boundedBy>
  <ogr:featureMember>
    <ogr:baumkataster gml:id="baumkataster.0">
      <ogr:geometryProperty><gml:Point gml:id="baumkataster.geom.0"><gml:pos>772563.98 6610965.57</gml:pos></gml:Point></ogr:geometryProperty>
      <ogr:Botanischer_Name>Platanus acerifolia </ogr:Botanischer_Name>
      <ogr:Deutscher_Name>Platane</ogr:Deutscher_Name>
      <ogr:Pflanzjahr></ogr:Pflanzjahr>
      <ogr:Stammumfang___cm>188</ogr:Stammumfang___cm>
      <ogr:Höhe___m>25</ogr:Höhe___m>
      <ogr:Kronendurchmesser___m>6</ogr:Kronendurchmesser___m>
      <ogr:Straße>Hohenzollernring</ogr:Straße>
      <ogr:Stadtteil>Neustadt/Nord</ogr:Stadtteil>
    </ogr:baumkataster>
  </ogr:featureMember>
</ogr:FeatureCollection>`;

const KOELN_EMPTY = `<?xml version="1.0" encoding="utf-8" ?>
<ogr:FeatureCollection xmlns:ogr="http://ogr.maptools.org/" xmlns:gml="http://www.opengis.net/gml/3.2">
  <gml:boundedBy><gml:Null /></gml:boundedBy>
</ogr:FeatureCollection>`;

const NOW = new Date(2026, 10, 3);

function treeOf(cityId: string, body: string, format: 'application/json' | 'text/xml') {
  const record = parseFeatureInfo(body, format);
  return record ? toStreetTree(cityId, record, NOW) : null;
}

describe('street-tree registers', () => {
  it('reads a Berlin street tree from the GeoServer JSON', () => {
    expect(treeOf('berlin', BERLIN_JSON, 'application/json')).toEqual({
      species: 'Silber-Linde', botanical: 'Tilia tomentosa', plantedYear: 1985,
      heightM: 13, crownM: 6, girthCm: 104, location: 'Unter den Linden', district: 'Mitte',
    });
  });

  it('names the park for a Berlin park tree, which has no street', () => {
    expect(treeOf('berlin', BERLIN_PARK_JSON, 'application/json')?.location).toBe('Großer Tiergarten');
  });

  it('reads a Hamburg tree from the GML, which gives no height', () => {
    expect(treeOf('hamburg', HAMBURG_XML, 'text/xml')).toEqual({
      species: 'Amerikanischer Amberbaum', botanical: 'Liquidambar styraciflua', plantedYear: 2021,
      heightM: null, crownM: 3, girthCm: 51, location: 'Dag-Hammarskjöld-Platz', district: 'St. Pauli',
    });
  });

  it('reads a Köln tree, trimming the name and leaving an empty planting year out', () => {
    expect(treeOf('koeln', KOELN_XML, 'text/xml')).toEqual({
      species: 'Platane', botanical: 'Platanus acerifolia', plantedYear: null,
      heightM: 25, crownM: 6, girthCm: 188, location: 'Hohenzollernring', district: 'Neustadt/Nord',
    });
  });

  it('finds no tree in an empty answer, an exception report or broken JSON', () => {
    expect(parseFeatureInfo(KOELN_EMPTY, 'text/xml')).toBeNull();
    expect(parseFeatureInfo('<ServiceExceptionReport><ServiceException>InvalidFormat</ServiceException></ServiceExceptionReport>', 'text/xml')).toBeNull();
    expect(parseFeatureInfo('{"type":"FeatureCollection","features":[]}', 'application/json')).toBeNull();
    expect(parseFeatureInfo('<html>', 'application/json')).toBeNull();
  });

  it('drops a planting year in the future or zero, and zero sizes', () => {
    const tree = toStreetTree('berlin', { 'Baumart (Deutsch)': 'Linde', Pflanzjahr: '2031', 'Baumhöhe in m': '0' }, NOW);
    expect(tree).toMatchObject({ species: 'Linde', plantedYear: null, heightM: null });
    expect(toStreetTree('berlin', { Pflanzjahr: '0' }, NOW)).toBeNull();
  });

  it('knows no register for München', () => {
    expect(toStreetTree('muenchen', { 'Baumart (Deutsch)': 'Linde' }, NOW)).toBeNull();
  });
});

describe('fetchStreetTree', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('asks the city register about the clicked point with WMS 1.3.0 and reads the answer', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(BERLIN_JSON, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const tree = await fetchStreetTree('berlin', 13.39103, 52.51703, 16);
    expect(tree?.species).toBe('Silber-Linde');
    const url = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://gdi.berlin.de/services/wms/baumbestand');
    expect(url.searchParams.get('version')).toBe('1.3.0');
    expect(url.searchParams.get('request')).toBe('GetFeatureInfo');
    expect(url.searchParams.get('info_format')).toBe('application/json');
    expect(url.searchParams.get('query_layers')).toBe('strassenbaeume,anlagenbaeume');
    // The window is centred on the point: 13.39103°E is 1,490,682.6 m east in web mercator
    const [minX, , maxX] = url.searchParams.get('bbox')!.split(',').map(Number);
    expect((minX! + maxX!) / 2).toBeCloseTo(1490682.6, 0);
    expect(maxX! - minX!).toBeLessThan(20);
  });

  it('asks nothing for a city without a register', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await fetchStreetTree('muenchen', 11.57, 48.14, 16)).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects on an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('down', { status: 503 })));
    await expect(fetchStreetTree('koeln', 6.94, 50.94, 16)).rejects.toThrow('503');
  });
});
