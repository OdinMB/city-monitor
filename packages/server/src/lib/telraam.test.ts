import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  addTelraamCsv, buildTelraamCounts, csvGzText, latestCountedDay, lineMidpoint, localDate, parseTelraamSegments, shiftDate, telraamMonths,
  type TelraamDays,
} from './telraam.js';

// The header of berlin-zaehlt.de's bzm_telraam_YYYY_MM.csv.gz (checked 2026-11-03)
const TELRAAM_HEADER = 'segment_id,date_local,uptime,ped_lft,ped_rgt,ped_total,bike_lft,bike_rgt,bike_total,car_lft,car_rgt,car_total,heavy_lft,heavy_rgt,heavy_total,v85,car_speed0,car_speed10,car_speed20,car_speed30,car_speed40,car_speed50,car_speed60,car_speed70';

/** One CSV row with the totals given (left/right and speed columns left at zero). */
function telraamRow(id: number, at: string, uptime: number, ped: number, bike: number, car: number, heavy: number): string {
  return [id, at, uptime, 0, 0, ped, 0, 0, bike, 0, 0, car, 0, 0, heavy, '', 0, 0, 0, 0, 0, 0, 0, 0].join(',');
}

/** A segment feature as the GeoJSON gives it (trimmed to what the parser reads). */
function telraamSegment(id: number, coords: number[][], address: Record<string, string>, name: unknown = 'Teststraße') {
  return {
    type: 'Feature',
    geometry: { type: 'MultiLineString', coordinates: [coords] },
    properties: { segment_id: id, osm: { name, address } },
  };
}

const BERLIN = { suburb: 'Kreuzberg', borough: 'Friedrichshain-Kreuzberg', 'ISO3166-2-lvl4': 'DE-BE' };

describe('csvGzText', () => {
  it('unpacks a raw gzip body and passes through one fetch already unpacked', () => {
    expect(csvGzText(new Uint8Array(gzipSync('a,b\n1,2')))).toBe('a,b\n1,2');
    expect(csvGzText(new TextEncoder().encode('a,b\n1,2'))).toBe('a,b\n1,2');
  });
});

describe('lineMidpoint', () => {
  it('finds the point halfway along the line by length', () => {
    expect(lineMidpoint([[0, 0], [1, 0], [1, 3]])).toEqual([1, 1]);
    expect(lineMidpoint([[13.4, 52.5]])).toEqual([13.4, 52.5]);
    expect(lineMidpoint([])).toBeNull();
  });
});

describe('parseTelraamSegments', () => {
  it('keeps the segments in the region with their midpoint, street and Ortsteil', () => {
    const segments = parseTelraamSegments({
      features: [
        telraamSegment(1, [[13.4, 52.5], [13.402, 52.5]], BERLIN),
        telraamSegment(2, [[13.7, 52.4], [13.71, 52.4]], { town: 'Schöneiche bei Berlin', 'ISO3166-2-lvl4': 'DE-BB' }),
        telraamSegment(3, [[13.3, 52.6], [13.3, 52.602]], { borough: 'Reinickendorf', 'ISO3166-2-lvl4': 'DE-BE' }, ['Dornbrunner Straße', 'Hallberger Zeile']),
        telraamSegment(4, [[13.3, 52.6]], BERLIN, null),
      ],
    }, 'DE-BE');
    expect([...segments.keys()]).toEqual([1, 3, 4]);
    expect(segments.get(1)).toEqual({ lon: 13.401, lat: 52.5, street: 'Teststraße', district: 'Kreuzberg' });
    expect(segments.get(3)).toMatchObject({ street: 'Dornbrunner Straße / Hallberger Zeile', district: 'Reinickendorf' });
    expect(segments.get(4)!.street).toBeNull();
  });

  it('throws on a body without features', () => {
    expect(() => parseTelraamSegments({ error: 'x' }, 'DE-BE')).toThrow(/features/);
  });
});

describe('addTelraamCsv', () => {
  it('sums each segment\'s hours per local date and counts the hours up at least half the time', () => {
    const days: TelraamDays = new Map();
    addTelraamCsv([
      TELRAAM_HEADER,
      telraamRow(1, '2026-11-02 07:00', 0.98, 8, 85, 1046, 211),
      telraamRow(1, '2026-11-02 08:00', 0.4, 2, 15, 100, 10),
      telraamRow(1, '2026-11-03 01:00', 0.99, 0, 0, 1, 0),
      telraamRow(9, '2026-11-02 07:00', 1, 5, 5, 5, 5), // not in the region
      '',
    ].join('\n'), new Map([[1, {}]]), days);
    expect(days.get('2026-11-02')!.get(1)).toEqual({ cars: 1146, bikes: 100, pedestrians: 10, heavy: 221, hours: 1 });
    expect(days.get('2026-11-03')!.get(1)!.cars).toBe(1);
    expect(days.get('2026-11-02')!.has(9)).toBe(false);
  });

  it('refuses a file without a column it reads', () => {
    expect(() => addTelraamCsv('segment_id,date_local,uptime\n1,2026-11-02 07:00,1', new Map([[1, {}]]), new Map()))
      .toThrow('Telraam CSV lacks ped_total, bike_total, car_total, heavy_total');
  });
});

describe('dates', () => {
  it('shifts dates across months and finds the local date', () => {
    expect(shiftDate('2026-11-02', -28)).toBe('2026-10-05');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(localDate(new Date('2026-11-02T23:30:00Z'), 'Europe/Berlin')).toBe('2026-11-03');
  });

  it('names the month files a day and its four weeks before fall in', () => {
    expect(telraamMonths('2026-11-02')).toEqual(['2026_10', '2026_11']);
    expect(telraamMonths('2026-10-31')).toEqual(['2026_10']);
  });
});

describe('latestCountedDay and buildTelraamCounts', () => {
  const day = (cars: number, bikes: number, hours = 8, pedestrians = 100, heavy = 50) => ({ cars, bikes, pedestrians, heavy, hours });
  const segments = new Map([
    [1, { lon: 13.4, lat: 52.5, street: 'A-Straße', district: 'Mitte' }],
    [2, { lon: 13.5, lat: 52.5, street: 'B-Straße', district: 'Pankow' }],
    [3, { lon: 13.6, lat: 52.5, street: null, district: null }],
  ]);

  it('takes the newest day before today with counts, skipping a day of zeros', () => {
    const days: TelraamDays = new Map([
      ['2026-11-01', new Map([[1, day(10, 10)]])],
      ['2026-11-02', new Map([[1, day(0, 0, 8, 0, 0)]])],
      ['2026-11-03', new Map([[1, day(10, 10)]])],
    ]);
    expect(latestCountedDay(days, '2026-11-03')).toBe('2026-11-01');
    expect(latestCountedDay(new Map(), '2026-11-03')).toBeNull();
  });

  it('compares each segment with the median of the same weekday in the four weeks before', () => {
    const days: TelraamDays = new Map([
      ['2026-11-02', new Map([[1, day(1000, 500)], [2, day(800, 100, 4)], [3, day(50, 5)]])],
      ['2026-10-26', new Map([[1, day(900, 400)], [2, day(700, 90)], [3, day(40, 4)]])],
      ['2026-10-19', new Map([[1, day(1100, 600)], [2, day(750, 80)]])],
      ['2026-10-12', new Map([[1, day(950, 300)], [2, day(720, 95)]])],
      ['2026-10-05', new Map([[1, day(0, 0, 0, 0, 0)]])], // the sensor was down: not a usual day
      ['2026-10-27', new Map([[1, day(5, 5)]])], // a Tuesday: not compared
    ]);
    const data = buildTelraamCounts(days, segments, '2026-11-02');
    expect(data.date).toBe('2026-11-02');
    expect(data.segments.map((s) => s.id)).toEqual([1, 2, 3]);
    const [one, two, three] = data.segments;
    expect(one).toMatchObject({ street: 'A-Straße', cars: 1000, bikes: 500, hours: 8 });
    expect(one.usual).toEqual({ cars: 950, bikes: 400, pedestrians: 100, heavy: 50, days: 3 });
    // 4 hours against a usual 8: an outage, not a quiet day
    expect(two.usual).toBeNull();
    // A single earlier Monday is not enough
    expect(three.usual).toBeNull();
  });

  it('leaves out segments without counts or outside the region', () => {
    const days: TelraamDays = new Map([['2026-11-02', new Map([[1, day(0, 0, 0, 0, 0)], [7, day(10, 10)]])]]);
    expect(buildTelraamCounts(days, segments, '2026-11-02').segments).toEqual([]);
  });
});
