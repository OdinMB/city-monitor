import { describe, it, expect } from 'vitest';
import { TransitAlertSchema } from '@city-monitor/shared/schemas.js';
import {
  announcementRequestBody, geofoxCredentials, geofoxHeaders, geofoxSignature, isInForce, parseGeofoxAnnouncements,
  parseGtiDateTime, type GtiAnnouncementResponse,
} from './geofox.js';

/**
 * Built from the documented example (GTI Anwenderhandbuch 63.4, §2.9.3,
 * listing 24: an S1/S11 announcement after a power cut at Hamburg Hbf), not
 * recorded from the live API. Its "..." elisions are dropped; its validity is
 * kept as documented, so `NOW` is inside it.
 */
const DOCUMENTED_RESPONSE = {
  returnCode: 'OK',
  announcements: [
    {
      id: '171012003C',
      locations: [
        {
          type: 'SINGLE_LINE',
          line: {
            name: 'S1',
            direction: 'Poppenbüttel / Hamburg Airport (Flughafen)',
            origin: 'Wedel',
            type: { simpleType: 'TRAIN', shortInfo: 'S', longInfo: 'S-Bahn' },
            id: 'ZVU-DB:S1_ZVU-DB_S-ZVU',
            dlid: 'de:hvv:S1:',
          },
          begin: { name: 'Poppenbüttel', city: 'Hamburg', combinedName: 'Poppenbüttel', id: 'Master:71953', type: 'STATION' },
          end: { name: 'Wedel', city: 'Wedel', combinedName: 'Wedel', id: 'Master:85950', type: 'STATION' },
        },
        {
          type: 'SINGLE_LINE',
          line: {
            name: 'S11',
            direction: 'Poppenbüttel',
            origin: 'Blankenese',
            type: { simpleType: 'TRAIN', shortInfo: 'S', longInfo: 'S-Bahn' },
            id: 'ZVU-DB:S11_ZVU-DB_S-ZVU',
            dlid: 'de:hvv:S1:',
          },
          begin: { name: 'Poppenbüttel', city: 'Hamburg', combinedName: 'Poppenbüttel', id: 'Master:71953', type: 'STATION' },
          end: { name: 'Blankenese', city: 'Hamburg', combinedName: 'Blankenese', id: 'Master:81950', type: 'STATION' },
        },
      ],
      description: ' \nAufgrund eines mittlerweile behobenen Stromausfalls am Hamburger Hauptbahnhof kommt es noch auf allen Linien zu Zugausfällen und Verspätungen. Die Züge der Linie S11 fallen aus.',
      publication: { begin: '2015-01-01T13:00:00.000+0100', end: '2017-10-12T10:00:00.000+0200' },
      validities: [{ begin: '2017-10-12T08:00:00.000+0200', end: '2017-10-12T10:00:00.000+0200' }],
      lastModified: '2017-10-12T08:34:55.877+0200',
    },
  ],
  lastUpdate: '2017-10-12T08:34:55.877+0200',
};

const NOW = new Date('2017-10-12T09:00:00+02:00');

describe('geofoxSignature', () => {
  it('matches the RFC 2202 HMAC-SHA1 test case 2, Base64-encoded', () => {
    // key "Jefe", digest effcdf6ae5eb2fa2d27416d5f184df9c259a7c79
    expect(geofoxSignature('what do ya want for nothing?', 'Jefe')).toBe('7/zfauXrL6LSdBbV8YTfnCWafHk=');
  });

  it('matches vectors computed independently with openssl, including a non-ASCII key', () => {
    // printf '%s' '<body>' | openssl dgst -sha1 -hmac '<key>' -binary | base64
    expect(geofoxSignature('{}', 'test-password')).toBe('HOTX4srTYViShHg2Fa49jdtOn+Q=');
    expect(geofoxSignature(announcementRequestBody(), 'pässwört')).toBe('zmP50pwx88ZnN3owxIUyKtuM5c4=');
  });
});

describe('announcementRequestBody', () => {
  it('asks for every current announcement in German, at API version 63, with full locations', () => {
    expect(JSON.parse(announcementRequestBody())).toEqual({ language: 'de', version: 63, full: true, filterPlanned: 'NO_FILTER' });
  });
});

describe('geofoxHeaders', () => {
  it('signs the exact body and names the user and algorithm', () => {
    const body = '{}';
    const headers = geofoxHeaders(body, { user: 'example-user', password: 'test-password' });
    expect(headers['geofox-auth-user']).toBe('example-user');
    expect(headers['geofox-auth-type']).toBe('HmacSHA1');
    expect(headers['geofox-auth-signature']).toBe('HOTX4srTYViShHg2Fa49jdtOn+Q=');
    expect(headers['Content-Type']).toBe('application/json;charset=UTF-8');
    expect(Object.values(headers)).not.toContain('test-password');
  });
});

describe('geofoxCredentials', () => {
  it('needs both variables', () => {
    expect(geofoxCredentials({})).toBeNull();
    expect(geofoxCredentials({ GEOFOX_USER: 'u' })).toBeNull();
    expect(geofoxCredentials({ GEOFOX_PASSWORD: 'p' })).toBeNull();
    expect(geofoxCredentials({ GEOFOX_USER: ' ', GEOFOX_PASSWORD: 'p' })).toBeNull();
    expect(geofoxCredentials({ GEOFOX_USER: 'u', GEOFOX_PASSWORD: 'p' })).toEqual({ user: 'u', password: 'p' });
  });
});

describe('parseGtiDateTime', () => {
  it('reads an offset written without a colon', () => {
    expect(parseGtiDateTime('2017-10-12T08:00:00.000+0200')).toBe(Date.parse('2017-10-12T06:00:00Z'));
    expect(parseGtiDateTime(undefined)).toBeNaN();
  });
});

describe('isInForce', () => {
  const at = NOW.getTime();
  it('is in force inside a validity and not outside every one', () => {
    expect(isInForce({ validities: [{ begin: '2017-10-12T08:00:00.000+0200', end: '2017-10-12T10:00:00.000+0200' }] }, at)).toBe(true);
    expect(isInForce({ validities: [{ begin: '2017-10-13T08:00:00.000+0200', end: '2017-10-13T10:00:00.000+0200' }] }, at)).toBe(false);
  });

  it('leaves out an advance notice: published now, valid later', () => {
    expect(isInForce({
      publication: { begin: '2017-10-01T00:00:00.000+0200', end: '2017-10-20T00:00:00.000+0200' },
      validities: [{ begin: '2017-10-14T22:00:00.000+0200', end: '2017-10-15T05:00:00.000+0200' }],
    }, at)).toBe(false);
  });

  it('falls back to the publication period without validities, and keeps an open-ended range', () => {
    expect(isInForce({ publication: { begin: '2017-10-01T00:00:00.000+0200' } }, at)).toBe(true);
    expect(isInForce({ publication: { begin: '2017-10-01T00:00:00.000+0200', end: '2017-10-02T00:00:00.000+0200' } }, at)).toBe(false);
  });
});

describe('parseGeofoxAnnouncements', () => {
  it('maps the documented example onto one alert listing both lines', () => {
    const alerts = parseGeofoxAnnouncements(DOCUMENTED_RESPONSE, NOW);
    expect(alerts).toHaveLength(1);
    const [alert] = alerts;
    expect(alert.lines).toEqual(['S1', 'S11']);
    expect(alert.line).toBe('S1, S11');
    // No summary (an unplanned announcement): the description's first sentence
    expect(alert.message).toBe('Aufgrund eines mittlerweile behobenen Stromausfalls am Hamburger Hauptbahnhof kommt es noch auf allen Linien zu Zugausfällen und Verspätungen.');
    expect(alert.detail).toBe('Aufgrund eines mittlerweile behobenen Stromausfalls am Hamburger Hauptbahnhof kommt es noch auf allen Linien zu Zugausfällen und Verspätungen. Die Züge der Linie S11 fallen aus.');
    // "Stromausfall" holds "ausfall"
    expect(alert.type).toBe('cancellation');
    expect(alert.severity).toBe('high');
    expect(alert.station).toBe('Poppenbüttel – Wedel');
    expect(alert.affectedStops).toEqual(['Poppenbüttel', 'Wedel', 'Blankenese']);
    // The documented stops carry no coordinate
    expect(alert.location).toBeNull();
    expect(TransitAlertSchema.safeParse(alert).success).toBe(true);
  });

  it('drops announcements not in force', () => {
    expect(parseGeofoxAnnouncements(DOCUMENTED_RESPONSE, new Date('2017-10-12T11:00:00+02:00'))).toEqual([]);
  });

  it('prefers the summary, merges the same text on the same section, and reads planned work', () => {
    const validities = [{ begin: '2017-10-12T00:00:00.000+0200' }];
    const section = { begin: { name: 'Barmbek', coordinate: { x: 10.044, y: 53.587, type: 'EPSG_4326' } }, end: { name: 'Wandsbek-Gartenstadt' } };
    const response: GtiAnnouncementResponse = {
      returnCode: 'OK',
      announcements: [
        { summary: 'U3: Ersatzverkehr mit Bussen', description: 'Wegen Gleisarbeiten fahren Busse.', planned: true, validities,
          locations: [{ type: 'SINGLE_LINE', line: { name: 'U3' }, ...section }] },
        { summary: 'U3: Ersatzverkehr mit Bussen', description: 'Wegen Gleisarbeiten fahren Busse.', planned: true, validities,
          locations: [{ type: 'SINGLE_LINE', line: { name: 'U1' }, ...section }] },
        { summary: 'Einschränkungen im gesamten Netz', description: 'Unwetter.', validities,
          locations: [{ type: 'COMPLETE_NET', name: 'hvv' }] },
      ],
    };
    const alerts = parseGeofoxAnnouncements(response, NOW);
    expect(alerts).toHaveLength(2);
    expect(alerts[0]).toMatchObject({
      lines: ['U3', 'U1'], type: 'planned-work', severity: 'low', message: 'U3: Ersatzverkehr mit Bussen',
      detail: 'Wegen Gleisarbeiten fahren Busse.', station: 'Barmbek – Wandsbek-Gartenstadt', location: { lat: 53.587, lon: 10.044 },
    });
    expect(alerts[1]).toMatchObject({ lines: ['hvv'], station: '', location: null, type: 'disruption' });
  });

  describe('Hamburg network filter', () => {
    const validities = [{ begin: '2017-10-12T00:00:00.000+0200' }];
    const single = (name: string) => ({ type: 'SINGLE_LINE', line: { name } });
    const announce = (summary: string, names: string[]) =>
      ({ summary, description: `${summary}.`, validities, locations: names.map(single) });

    it('keeps U-, S-Bahn, AKN, ferries, city, Xpress and night buses; drops 4-digit and suffixed regional buses', () => {
      const keep = ['U1', 'S3', 'A1', '62', '5', '112', 'X35', '609', 'U3-SEV'];
      const drop = ['2001', '6560', '8894', '2303-KVG', '332-VKP', 'SEV'];
      const response: GtiAnnouncementResponse = {
        returnCode: 'OK',
        announcements: [...keep, ...drop].map((n) => announce(`Meldung ${n}`, [n])),
      };
      const alerts = parseGeofoxAnnouncements(response, NOW);
      expect(alerts.map((a) => a.line)).toEqual(keep);
    });

    it('keeps an announcement with mixed lines but lists only the Hamburg ones', () => {
      const response: GtiAnnouncementResponse = {
        returnCode: 'OK',
        announcements: [announce('Haltestellenausfall', ['6580', '411', 'X80', '2303-KVG'])],
      };
      const [alert] = parseGeofoxAnnouncements(response, NOW);
      expect(alert.lines).toEqual(['411', 'X80']);
      expect(alert.line).toBe('411, X80');
    });

    it('keeps regional trains, but not on the stand-alone replacement-bus stop notices', () => {
      const response: GtiAnnouncementResponse = {
        returnCode: 'OK',
        announcements: [
          announce('Haltestelleninformation für EV in Westerland(Sylt)', ['SEV']),
          announce('Haltestelleninformation für EV in Kiel Hbf', ['SEV', 'RE7-SEV', 'RE7']),
          announce('RE7: Störung zwischen Elmshorn und Hamburg Hbf', ['RE7', 'RB61']),
        ],
      };
      const alerts = parseGeofoxAnnouncements(response, NOW);
      expect(alerts).toHaveLength(1);
      expect(alerts[0].lines).toEqual(['RE7', 'RB61']);
    });

    it('keeps the whole hvv network and Hamburg carriers, drops regional carriers', () => {
      const response: GtiAnnouncementResponse = {
        returnCode: 'OK',
        announcements: [
          { summary: 'Unwetter', description: 'Unwetter.', validities, locations: [{ type: 'COMPLETE_NET', name: 'hvv' }] },
          { summary: 'Streik HOCHBAHN', description: 'Streik.', validities, locations: [{ type: 'ALL_LINES_OF_CARRIER', name: 'HOCHBAHN' }] },
          { summary: 'Warnstreiks bei der VKP', description: 'Streik.', validities, locations: [{ type: 'ALL_LINES_OF_CARRIER', name: 'VKP' }] },
        ],
      };
      expect(parseGeofoxAnnouncements(response, NOW).map((a) => a.line)).toEqual(['hvv', 'HOCHBAHN']);
    });
  });

  it('never rates planned work above medium, while unplanned closures and cancellations stay high', () => {
    const validities = [{ begin: '2017-10-12T00:00:00.000+0200' }];
    const bus = [{ type: 'SINGLE_LINE', line: { name: '3' } }];
    const response: GtiAnnouncementResponse = {
      returnCode: 'OK',
      announcements: [
        { summary: 'Sperrung Holstenstraße', description: 'Umleitung.', planned: true, reason: 'ROADWORKS', validities, locations: bus },
        { summary: 'U2: Störung', description: 'Weichenstörung.', validities, locations: [{ type: 'SINGLE_LINE', line: { name: 'U2' } }] },
        { summary: 'Ausfall', description: 'Fahrten fallen aus.', validities, locations: bus },
      ],
    };
    const alerts = parseGeofoxAnnouncements(response, NOW);
    expect(alerts.map((a) => [a.type, a.severity])).toEqual([
      ['planned-work', 'medium'],
      ['disruption', 'high'],
      ['cancellation', 'high'],
    ]);
  });

  it('shortens a long first sentence for the message and keeps the full text as detail', () => {
    const description = `${'Sehr lange Meldung '.repeat(20)}Ende.`;
    const [alert] = parseGeofoxAnnouncements({ returnCode: 'OK', announcements: [{ description }] }, NOW);
    expect(alert.message.length).toBe(160);
    expect(alert.message.endsWith('…')).toBe(true);
    expect(alert.detail).toBe(description);
  });
});
