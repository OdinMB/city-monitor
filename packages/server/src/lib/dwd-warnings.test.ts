import { describe, it, expect } from 'vitest';
import { assertDwdWarningsShape, parseDwdWarnings, parseDwdWarningsJsonp } from './dwd-warnings.js';

const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 4, 1, 10); // 2026-05-01T10:00Z

function berlinCell(regionName: string) {
  return { state: 'Berlin', stateShort: 'BE', regionName };
}

const sturmboeen = {
  type: 1,
  level: 3,
  start: T0,
  end: T0 + 8 * HOUR,
  event: 'STURMBÖEN',
  headline: 'Amtliche WARNUNG vor STURMBÖEN',
  description: 'Es treten Sturmböen mit Geschwindigkeiten um 70 km/h aus westlicher Richtung auf.',
  instruction: 'Hinweis auf mögliche Gefahren: Es können zum Beispiel einzelne Äste herabstürzen.',
  altitudeStart: null,
  altitudeEnd: null,
};

// Shape of DWD's warnings.json (www.dwd.de/DWD/warnungen/warnapp/json/warnings.json), invented values:
// warnings keyed by warncell id, each with a list of entries. One Berlin-wide warning covers two of
// the city's cells; a lower-level warning, an open-ended one, a neighbouring district and Hamburg
// sit beside it, and a pre-announcement waits in vorabInformation.
const fixture = {
  time: T0,
  warnings: {
    '102000000': [{
      state: 'Hamburg', stateShort: 'HH', regionName: 'Hamburg',
      type: 1, level: 4, start: T0, end: T0 + 6 * HOUR,
      event: 'ORKANARTIGE BÖEN', headline: 'Amtliche UNWETTERWARNUNG vor ORKANARTIGEN BÖEN',
      description: 'Es treten orkanartige Böen mit Geschwindigkeiten um 110 km/h auf.', instruction: '',
      altitudeStart: null, altitudeEnd: null,
    }],
    '111001000': [
      { ...berlinCell('Berlin-Mitte'), ...sturmboeen },
      {
        ...berlinCell('Berlin-Mitte'),
        type: 1, level: 2, start: T0 - 4 * HOUR, end: T0,
        event: 'WINDBÖEN', headline: 'Amtliche WARNUNG vor WINDBÖEN',
        description: 'Es treten Windböen mit Geschwindigkeiten um 55 km/h auf.', instruction: '',
        altitudeStart: null, altitudeEnd: null,
      },
    ],
    '111005000': [
      { ...berlinCell('Berlin-Spandau'), ...sturmboeen },
      {
        ...berlinCell('Berlin-Spandau'),
        type: 0, level: 4, start: T0 + 2 * HOUR, end: null,
        event: 'SCHWERES GEWITTER mit HAGEL', headline: 'Amtliche UNWETTERWARNUNG vor SCHWEREM GEWITTER mit HAGEL',
        description: 'Es treten Gewitter mit Hagel um 3 cm auf.', instruction: 'Schließen Sie Fenster und Türen.',
        altitudeStart: null, altitudeEnd: null,
      },
    ],
    '112063000': [{
      state: 'Brandenburg', stateShort: 'BB', regionName: 'Kreis Havelland',
      type: 2, level: 3, start: T0, end: T0 + 12 * HOUR,
      event: 'DAUERREGEN', headline: 'Amtliche WARNUNG vor DAUERREGEN',
      description: 'Es tritt Dauerregen auf.', instruction: '',
      altitudeStart: null, altitudeEnd: null,
    }],
  },
  vorabInformation: {
    '111001000': [{
      ...berlinCell('Berlin-Mitte'),
      type: 1, level: 1, start: T0 + 24 * HOUR, end: T0 + 36 * HOUR,
      event: 'VORABINFORMATION ORKANBÖEN', headline: 'VORABINFORMATION UNWETTER vor ORKANBÖEN',
      description: 'Es werden orkanartige Böen erwartet.', instruction: '',
      altitudeStart: null, altitudeEnd: null,
    }],
  },
  copyright: 'Copyright Deutscher Wetterdienst',
};

/** A payload with one Berlin cell holding the given entries. */
function payload(...entries: unknown[]) {
  return { time: T0, warnings: { '111000000': entries }, vorabInformation: {}, copyright: 'Copyright Deutscher Wetterdienst' };
}

function warning(level: number, overrides: Record<string, unknown> = {}) {
  return {
    ...berlinCell('Berlin'), type: 1, level, start: T0, end: T0 + HOUR,
    event: 'TEST', headline: `Warnung der Stufe ${level}`, description: 'Testwarnung.', instruction: '',
    altitudeStart: null, altitudeEnd: null, ...overrides,
  };
}

describe('parseDwdWarningsJsonp', () => {
  it('unwraps the warnWetter.loadWarnings callback', () => {
    expect(parseDwdWarningsJsonp(`warnWetter.loadWarnings(${JSON.stringify(fixture)});`)).toEqual(fixture);
    expect(parseDwdWarningsJsonp(`warnWetter.loadWarnings(${JSON.stringify(fixture)})\n`)).toEqual(fixture);
  });

  it('throws when the body is not JSON', () => {
    expect(() => parseDwdWarningsJsonp('<html>Wartungsarbeiten</html>')).toThrow();
  });
});

describe('parseDwdWarnings', () => {
  it("returns the city's warnings once each, dropping lower-level ones, other regions and pre-announcements", () => {
    expect(parseDwdWarnings(fixture, 'Berlin')).toEqual([
      {
        headline: 'Amtliche WARNUNG vor STURMBÖEN',
        severity: 'moderate',
        description: 'Es treten Sturmböen mit Geschwindigkeiten um 70 km/h aus westlicher Richtung auf.',
        validUntil: '2026-05-01T18:00:00.000Z',
      },
      {
        headline: 'Amtliche UNWETTERWARNUNG vor SCHWEREM GEWITTER mit HAGEL',
        severity: 'severe',
        description: 'Es treten Gewitter mit Hagel um 3 cm auf.',
        validUntil: '',
      },
    ]);
  });

  it('matches the region name case-insensitively', () => {
    expect(parseDwdWarnings(fixture, 'hamburg')).toEqual([{
      headline: 'Amtliche UNWETTERWARNUNG vor ORKANARTIGEN BÖEN',
      severity: 'severe',
      description: 'Es treten orkanartige Böen mit Geschwindigkeiten um 110 km/h auf.',
      validUntil: '2026-05-01T16:00:00.000Z',
    }]);
  });

  it.each([
    [1, undefined], // Vorabinformation
    [2, undefined], // Wetterwarnung
    [3, 'moderate'], // markantes Wetter
    [4, 'severe'], // Unwetter
    [5, 'extreme'], // extremes Unwetter
    [10, 'moderate'], // starke Wärmebelastung
    [11, 'severe'], // extreme Wärmebelastung
    [0, undefined],
    [6, undefined],
  ])('maps level %i to severity %s', (level, severity) => {
    expect(parseDwdWarnings(payload(warning(level)), 'Berlin')?.[0]?.severity).toBe(severity);
  });

  it('keeps warnings with the same headline at different times', () => {
    const later = warning(3, { start: T0 + 10 * HOUR, end: T0 + 14 * HOUR });
    expect(parseDwdWarnings(payload(warning(3), later), 'Berlin')?.map((a) => a.validUntil)).toEqual([
      '2026-05-01T11:00:00.000Z',
      '2026-05-02T00:00:00.000Z',
    ]);
  });

  it('skips malformed entries and keeps the rest', () => {
    const json = payload(
      null,
      'Sturm',
      warning(3, { level: '3' }),
      warning(3, { headline: 5 }),
      warning(3, { regionName: undefined }),
      warning(4, { description: undefined, end: undefined }),
    );
    expect(parseDwdWarnings(json, 'Berlin')).toEqual([
      { headline: 'Warnung der Stufe 4', severity: 'severe', description: '', validUntil: '' },
    ]);
  });

  it('returns an empty list when nothing is warned', () => {
    expect(parseDwdWarnings({ time: T0, warnings: {}, vorabInformation: {}, copyright: '' }, 'Berlin')).toEqual([]);
  });

  it('returns null when the payload has no warnings object', () => {
    for (const json of [
      null,
      'warnWetter',
      {},
      { warnings: null },
      { warnings: [] },
      // warncells at the top level, without the warnings object
      { '111000000': [warning(3)] },
    ]) {
      expect(parseDwdWarnings(json, 'Berlin'), JSON.stringify(json)).toBeNull();
    }
  });
});

describe('assertDwdWarningsShape', () => {
  it('counts the warncells and returns the entries', () => {
    const { cells, entries } = assertDwdWarningsShape(fixture);
    expect(cells).toBe(4);
    expect(entries).toHaveLength(6);
    expect(entries.filter((e) => e.regionName.startsWith('Berlin')).map((e) => e.level)).toEqual([3, 2, 3, 4]);
  });

  it('accepts a payload without warnings', () => {
    expect(assertDwdWarningsShape({ time: T0, warnings: {}, vorabInformation: {}, copyright: '' })).toEqual({ cells: 0, entries: [] });
  });

  it('throws when the warnings object is missing', () => {
    expect(() => assertDwdWarningsShape({})).toThrow(/"warnings"/);
    expect(() => assertDwdWarningsShape({ '111000000': [warning(3)] })).toThrow(/"warnings"/);
    expect(() => assertDwdWarningsShape({ warnings: [] })).toThrow(/"warnings"/);
  });

  it('throws when a warncell holds no list', () => {
    expect(() => assertDwdWarningsShape({ warnings: { '111000000': warning(3) } })).toThrow(/111000000/);
  });

  it.each([
    ['level', { level: '3' }],
    ['headline', { headline: undefined }],
    ['regionName', { regionName: 7 }],
  ])('throws when an entry has no usable %s', (field, overrides) => {
    expect(() => assertDwdWarningsShape(payload(warning(3), warning(3, overrides)))).toThrow(new RegExp(`"${field}"`));
  });

  it('throws when an entry is not an object', () => {
    expect(() => assertDwdWarningsShape(payload(null))).toThrow(/111000000/);
  });
});
