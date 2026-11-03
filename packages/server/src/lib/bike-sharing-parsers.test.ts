import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { koeln } from '../config/cities/koeln.js';
import { hamburg } from '../config/cities/hamburg.js';
import {
  gbfsFeedUrls, parseGbfsStations, parseStadtradThings, stadtradThingsUrl, STADTRAD_MAX_SILENCE_MS,
} from './bike-sharing-parsers.js';

/** Recorded on 2026-11-03 around 01:15 UTC and trimmed: KVB-Rad (nextbike GBFS, CC0-1.0), StadtRAD (dl-de/by-2.0). */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./bike-sharing-fixtures/${name}.json`, import.meta.url), 'utf8'));
}

const NOW = Date.parse('2026-11-03T01:15:00Z');

describe('gbfsFeedUrls', () => {
  it('finds the station feeds in the German feed list', () => {
    expect(gbfsFeedUrls(fixture('kvb-rad-gbfs'))).toEqual({
      info: 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_kg/de/station_information.json',
      status: 'https://gbfs.nextbike.net/maps/gbfs/v2/nextbike_kg/de/station_status.json',
    });
  });

  it('takes the first language when there is no German one', () => {
    const json = { data: { en: { feeds: [{ name: 'station_information', url: 'i' }, { name: 'station_status', url: 's' }] } } };
    expect(gbfsFeedUrls(json)).toEqual({ info: 'i', status: 's' });
  });

  it('is null without both station feeds', () => {
    expect(gbfsFeedUrls({ data: { de: { feeds: [{ name: 'station_information', url: 'i' }] } } })).toBeNull();
    expect(gbfsFeedUrls({})).toBeNull();
    expect(gbfsFeedUrls(null)).toBeNull();
  });
});

describe('parseGbfsStations', () => {
  const parsed = parseGbfsStations(fixture('kvb-rad-station-information'), fixture('kvb-rad-station-status'), koeln.boundingBox)!;

  it('reads every station with its bikes, and the feed time', () => {
    expect(parsed.stations).toHaveLength(6);
    expect(parsed.stations[0]).toEqual({
      id: '430479', name: 'KVB Hauptverwaltung', lat: 50.93883, lon: 6.90627, bikes: 1, docks: 7, reportedAt: 1793668586,
    });
    expect(parsed.updated).toBe(new Date(1793668586 * 1000).toISOString());
  });

  it('gives free docks only for a docked station with a capacity', () => {
    const docks = Object.fromEntries(parsed.stations.map((s) => [s.id, s.docks]));
    expect(docks).toEqual({
      430479: 7, 1079530: 15,          // capacity given
      746518: null, 2802298: null,     // no capacity: nextbike reports 0 docks
      1298545: null, 31363740: null,   // virtual stations
    });
  });

  it('leaves out stations outside the box, not installed or not renting, and those without a status', () => {
    const info = { data: { stations: [
      { station_id: 'a', name: 'In', lat: 50.94, lon: 6.95, capacity: 10 },
      { station_id: 'b', name: 'Outside', lat: 51.2, lon: 6.95 },
      { station_id: 'c', name: 'Not renting', lat: 50.94, lon: 6.95 },
      { station_id: 'd', name: 'Not installed', lat: 50.94, lon: 6.95 },
      { station_id: 'e', name: 'No status', lat: 50.94, lon: 6.95 },
      { station_id: 'f', name: 'No count', lat: 50.94, lon: 6.95 },
    ] } };
    const status = { data: { stations: [
      { station_id: 'a', num_bikes_available: 3, num_docks_available: 7, is_installed: true, is_renting: true },
      { station_id: 'b', num_bikes_available: 3 },
      { station_id: 'c', num_bikes_available: 3, is_renting: false },
      { station_id: 'd', num_bikes_available: 3, is_installed: false },
      { station_id: 'f' },
    ] } };
    const r = parseGbfsStations(info, status, koeln.boundingBox)!;
    expect(r.stations.map((s) => s.id)).toEqual(['a']);
    expect(r.stations[0]).toMatchObject({ bikes: 3, docks: 7, reportedAt: null });
    expect(r.updated).toBeNull();
  });

  it('is null when either body is not GBFS', () => {
    expect(parseGbfsStations({}, fixture('kvb-rad-station-status'), koeln.boundingBox)).toBeNull();
    expect(parseGbfsStations(fixture('kvb-rad-station-information'), null, koeln.boundingBox)).toBeNull();
  });
});

describe('stadtradThingsUrl', () => {
  it('asks for the StadtRAD things with the newest bike count only', () => {
    const url = new URL(stadtradThingsUrl('https://iot.hamburg.de/v1.1'));
    expect(url.pathname).toBe('/v1.1/Things');
    expect(url.searchParams.get('$filter')).toBe("Datastreams/properties/serviceName eq 'HH_STA_StadtRad'");
    expect(url.searchParams.get('$expand')).toContain("Datastreams($filter=properties/layerName eq 'Fahrraeder'");
    expect(url.searchParams.get('$expand')).toContain('$top=1;$orderby=phenomenonTime desc');
  });
});

describe('parseStadtradThings', () => {
  const parsed = parseStadtradThings(fixture('stadtrad-things'), hamburg.boundingBox, NOW)!;

  it('reads each station with its name, place, bikes and when the count last changed', () => {
    expect(parsed.stations[0]).toEqual({
      id: '6', name: 'S+U Berliner Tor / Beim Strohhause', lat: 53.5533, lon: 10.0246, bikes: 11, docks: null,
      reportedAt: Math.floor(Date.parse('2026-11-03T00:22:03.002678Z') / 1000),
    });
    expect(parsed.newest).toBe(Date.parse('2026-11-03T00:22:03.002678Z'));
  });

  it('leaves out a station whose count has stood still for more than a month', () => {
    // "Lübeck" last changed in May 2025
    expect(parsed.stations.map((s) => s.id)).toEqual(['6', '7', '8']);
    const stale = { value: [{
      '@iot.id': 1, description: 'StadtRad-Station X',
      Locations: [{ location: { type: 'Point', coordinates: [10, 53.55] } }],
      Datastreams: [{ Observations: [{ phenomenonTime: new Date(NOW - STADTRAD_MAX_SILENCE_MS + 60_000).toISOString(), result: 2 }] }],
    }] };
    // A bare geometry as the location, a month less a minute old: kept
    expect(parseStadtradThings(stale, hamburg.boundingBox, NOW)!.stations).toHaveLength(1);
  });

  it('skips things without a location inside the box or without an observation', () => {
    const json = { value: [
      { '@iot.id': 1, description: 'StadtRad-Station Far', Locations: [{ location: { type: 'Point', coordinates: [11, 53.55] } }], Datastreams: [{ Observations: [{ phenomenonTime: '2026-11-03T00:00:00Z', result: 1 }] }] },
      { '@iot.id': 2, description: 'StadtRad-Station Empty', Locations: [{ location: { type: 'Point', coordinates: [10, 53.55] } }], Datastreams: [{ Observations: [] }] },
      { '@iot.id': 3, description: 'StadtRad-Station Nowhere', Locations: [], Datastreams: [] },
    ] };
    expect(parseStadtradThings(json, hamburg.boundingBox, NOW)).toEqual({ stations: [], newest: null });
  });

  it('is null when the body is not a SensorThings collection', () => {
    expect(parseStadtradThings({ error: 'x' }, hamburg.boundingBox, NOW)).toBeNull();
  });
});
