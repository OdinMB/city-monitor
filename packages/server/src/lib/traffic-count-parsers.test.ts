import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hamburg } from '../config/cities/hamburg.js';
import {
  aggregateSites, hamburgHoursUrl, hamburgLatestUrl, hamburgSitesUrl, median, parseHamburgCounters, parseHamburgHours,
  parseHamburgSiteNames, pickCountHour, referenceHours, utcOffsetMs, COUNTER_FRESH_MS,
} from './traffic-count-parsers.js';

/**
 * Recorded on 2026-11-03 around 01:45 UTC from iot.hamburg.de and the
 * Verkehrszählstellen WFS (dl-de/by-2.0), trimmed to three car sites with
 * three counters each.
 */
function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./traffic-count-fixtures/${name}.json`, import.meta.url), 'utf8'));
}

const NOW = Date.parse('2026-11-03T01:45:00Z');
const H = Date.parse('2026-11-02T23:00:00Z');
const BASE = 'https://iot.hamburg.de/v1.1';

describe('Hamburg SensorThings URLs', () => {
  it('asks for the hourly car counters by name, with their thing\'s location and newest observation', () => {
    const url = new URL(hamburgLatestUrl(BASE, 'car'));
    expect(url.pathname).toBe('/v1.1/Datastreams');
    expect(url.searchParams.get('$filter')).toBe("startswith(name,'Kfz-Aufkommen an Verkehrszählstelle') and endswith(name,'im 1-Stunde-Intervall')");
    expect(url.searchParams.get('$expand')).toContain('Locations');
    expect(url.searchParams.get('$expand')).toContain('$top=1;$orderby=phenomenonTime desc');
  });

  it('asks for the bicycle counters\' observations in the given hours only', () => {
    const url = new URL(hamburgHoursUrl(BASE, 'bike', [H, H - 7 * 86_400_000]));
    expect(url.searchParams.get('$filter')).toContain("startswith(name,'Fahrrad-Aufkommen an Verkehrszählstelle')");
    expect(url.searchParams.get('$expand')).toBe(
      'Observations($select=phenomenonTime,result;$top=4;$filter=(phenomenonTime ge 2026-11-02T23:00:00Z and phenomenonTime lt 2026-11-03T00:00:00Z)'
      + ' or (phenomenonTime ge 2026-10-26T23:00:00Z and phenomenonTime lt 2026-10-27T00:00:00Z))',
    );
  });

  it('asks the WFS for the site list of each mode', () => {
    const wfs = 'https://geodienste.hamburg.de/HH_WFS_Verkehrszaehlstellen';
    expect(hamburgSitesUrl(wfs, 'car')).toContain('typeNames=app:kfz_zaehlstellen');
    expect(hamburgSitesUrl(wfs, 'bike')).toContain('typeNames=app:radverkehr_zaehlstellen');
  });
});

describe('parseHamburgCounters', () => {
  const counters = parseHamburgCounters(fixture('car-latest'), hamburg.boundingBox)!;

  it('reads each counter with its site, position and newest hour', () => {
    expect(counters).toHaveLength(9);
    expect(counters.find((c) => c.id === '28362')).toEqual({ id: '28362', site: '0113', lat: 53.541073, lon: 10.003918, latest: H });
    expect(counters.filter((c) => c.latest === H + 3_600_000).map((c) => c.id).sort()).toEqual(['29029', '32551']);
  });

  it('drops counters outside the city, without a site or position, and is null for a body that is not a collection', () => {
    const json = {
      value: [
        { '@iot.id': 1, properties: { assetID: '0001' }, Thing: { Locations: [{ location: { geometry: { coordinates: [11.5, 48.1] } } }] } },
        { '@iot.id': 2, properties: {}, Thing: { Locations: [{ location: { geometry: { coordinates: [10, 53.55] } } }] } },
        { '@iot.id': 3, properties: { assetID: '0003' }, Thing: { Locations: [] } },
        { '@iot.id': 4, properties: { assetID: '0004' }, Thing: { Locations: [{ location: { type: 'Point', coordinates: [10, 53.55] } }] } },
      ],
    };
    expect(parseHamburgCounters(json, hamburg.boundingBox)).toEqual([{ id: '4', site: '0004', lat: 53.55, lon: 10, latest: null }]);
    expect(parseHamburgCounters({ error: 'x' }, hamburg.boundingBox)).toBeNull();
  });
});

describe('pickCountHour', () => {
  const h = (n: number) => H + n * 3_600_000;

  it('takes the newest hour two thirds of the working counters have reached', () => {
    const counters = parseHamburgCounters(fixture('car-latest'), hamburg.boundingBox)!;
    // 2 of 9 have midnight UTC, all have 23:00
    expect(pickCountHour(counters.map((c) => c.latest), NOW)).toBe(H);
    expect(pickCountHour([h(1), h(1), h(0)], NOW)).toBe(h(1));
    expect(pickCountHour([h(1), h(0), h(0)], NOW)).toBe(h(0));
  });

  it('leaves counters silent for hours out of the count, and is null when all are', () => {
    const silent = H - COUNTER_FRESH_MS - 3_600_000;
    expect(pickCountHour([h(1), h(1), silent, silent, null], NOW)).toBe(h(1));
    expect(pickCountHour([silent, null], NOW)).toBeNull();
    expect(pickCountHour([], NOW)).toBeNull();
  });
});

describe('referenceHours', () => {
  it('goes back to the same local hour on the same weekday, across the end of summer time', () => {
    // 00:00 on a Tuesday in Hamburg; summer time ended on 25 October
    expect(referenceHours(H).map((t) => new Date(t).toISOString())).toEqual([
      '2026-10-26T23:00:00.000Z', '2026-10-19T22:00:00.000Z', '2026-10-12T22:00:00.000Z', '2026-10-05T22:00:00.000Z',
    ]);
  });

  it('knows Berlin time\'s offset in winter and summer', () => {
    expect(utcOffsetMs(H, 'Europe/Berlin')).toBe(3_600_000);
    expect(utcOffsetMs(Date.parse('2026-07-01T12:00:00Z'), 'Europe/Berlin')).toBe(7_200_000);
  });
});

describe('parseHamburgHours', () => {
  it('splits each counter\'s observations into the hour counted and the reference hours', () => {
    const hours = parseHamburgHours(fixture('car-hours'), H, referenceHours(H))!;
    expect(hours.size).toBe(9);
    expect(hours.get('28362')).toEqual({ count: 12, references: [46, 48, 38, 48] });
  });

  it('ignores negative and missing results, and observations in other hours', () => {
    const json = { value: [{ '@iot.id': 7, Observations: [
      { phenomenonTime: '2026-11-02T23:00:00Z/2026-11-02T23:59:59Z', result: -1 },
      { phenomenonTime: '2026-10-26T23:00:00Z/2026-10-26T23:59:59Z', result: null },
      { phenomenonTime: '2026-10-26T22:00:00Z/2026-10-26T22:59:59Z', result: 5 },
    ] }] };
    expect(parseHamburgHours(json, H, referenceHours(H))!.get('7')).toEqual({ count: null, references: [] });
    expect(parseHamburgHours('nope', H, [])).toBeNull();
  });
});

describe('parseHamburgSiteNames', () => {
  it('maps site numbers to junction names', () => {
    expect([...parseHamburgSiteNames(fixture('car-sites'))]).toEqual([
      ['0113', 'Shanghaiallee / Überseeallee'],
      ['0205', 'Holsteiner Chaussee / Marek-James-Straße'],
    ]);
    expect(parseHamburgSiteNames(null).size).toBe(0);
  });
});

describe('median', () => {
  it('is the middle value, or the mean of the two middle ones', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([46, 48, 38, 48])).toBe(47);
  });
});

describe('aggregateSites', () => {
  const counters = parseHamburgCounters(fixture('car-latest'), hamburg.boundingBox)!;
  const hours = parseHamburgHours(fixture('car-hours'), H, referenceHours(H))!;
  const names = parseHamburgSiteNames(fixture('car-sites'));

  it('sums each site\'s counters and their usual counts', () => {
    const sites = aggregateSites('car', counters, hours, names, H);
    expect(sites.map(({ site, count, typical, counters: n }) => ({ site, count, typical, n }))).toEqual([
      // Medians 47 + 21.5 + 68.5
      { site: '0113', count: 64, typical: 137, n: 3 },
      { site: '0203', count: 66, typical: 55, n: 3 },
      { site: '0205', count: 94, typical: 67, n: 3 },
    ]);
    expect(sites[0]).toMatchObject({
      id: 'car-0113', mode: 'car', name: 'Shanghaiallee / Überseeallee', hour: '2026-11-02T23:00:00.000Z', lat: 53.54107, lon: 10.00377,
    });
    // Not on the WFS list
    expect(sites[1]!.name).toBeNull();
  });

  it('compares only the counters with a usual count, and shows a site without any uncompared', () => {
    const c = (id: string, site: string) => ({ id, site, lat: 53.5, lon: 10, latest: H });
    const h = new Map([
      ['a', { count: 10, references: [8, 12] }],
      ['b', { count: 5, references: [4] }],
      ['c', { count: 7, references: [] }],
      ['d', { count: null, references: [9, 9] }],
    ]);
    const sites = aggregateSites('bike', [c('a', '1'), c('b', '1'), c('c', '2'), c('d', '3')], h, new Map(), H);
    expect(sites.map(({ id, count, typical, counters: n }) => ({ id, count, typical, n }))).toEqual([
      { id: 'bike-1', count: 10, typical: 10, n: 1 },
      { id: 'bike-2', count: 7, typical: null, n: 1 },
    ]);
  });
});
