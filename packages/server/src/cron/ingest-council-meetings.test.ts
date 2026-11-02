import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  extractCommittee,
  buildLocation,
  parsePardokXml,
  berlinUtcOffset,
  fetchOparlMeetings,
  parseOparlMeetings,
  parseMuenchenRisFeed,
  parseRisTitle,
  parseBuergerschaftCalendar,
  buergerschaftSearchUrl,
  type OparlTarget,
} from './ingest-council-meetings.js';
import { gunzipSync } from 'node:zlib';

/** Trimmed from responses recorded on 2026-11-01. */
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('extractCommittee', () => {
  it('extracts committee after "des"', () => {
    expect(extractCommittee('77. Sitzung des Ausschusses fur Bildung'))
      .toBe('Ausschusses fur Bildung');
  });

  it('extracts committee after "der"', () => {
    expect(extractCommittee('12. Sitzung der BVV Mitte'))
      .toBe('BVV Mitte');
  });

  it('returns full name when no "des/der" match', () => {
    expect(extractCommittee('Plenarsitzung')).toBe('Plenarsitzung');
  });

  it('handles empty string', () => {
    expect(extractCommittee('')).toBe('');
  });
});

describe('buildLocation', () => {
  it('returns room + streetAddress when both present', () => {
    expect(buildLocation({ room: 'Room 101', streetAddress: 'Karl-Marx-Str. 1' }))
      .toBe('Room 101, Karl-Marx-Str. 1');
  });

  it('returns room only when no streetAddress or description', () => {
    expect(buildLocation({ room: 'Room 101' })).toBe('Room 101');
  });

  it('returns room + description when no streetAddress', () => {
    expect(buildLocation({ room: 'Room 101', description: 'City Hall' }))
      .toBe('Room 101, City Hall');
  });

  it('prefers streetAddress over description', () => {
    expect(buildLocation({ room: 'Room 101', streetAddress: 'Karl-Marx-Str. 1', description: 'City Hall' }))
      .toBe('Room 101, Karl-Marx-Str. 1');
  });

  it('returns undefined for null input', () => {
    expect(buildLocation(null as unknown as undefined)).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(buildLocation(undefined)).toBeUndefined();
  });

  it('returns undefined for empty object (no truthy fields)', () => {
    expect(buildLocation({})).toBeUndefined();
  });
});

describe('berlinUtcOffset', () => {
  it('returns "+01:00" for a winter date (CET)', () => {
    expect(berlinUtcOffset('2026-01-15 10:00:00')).toBe('+01:00');
  });

  it('returns "+02:00" for a summer date (CEST)', () => {
    expect(berlinUtcOffset('2026-07-15 10:00:00')).toBe('+02:00');
  });

  it('handles DST transition boundary (last Sunday of March)', () => {
    // 2026-03-29 is the last Sunday of March — clocks spring forward at 02:00 CET
    // At 01:59 CET (00:59 UTC) it's still CET (+01:00)
    expect(berlinUtcOffset('2026-03-29 00:30:00')).toBe('+01:00');
    // At 03:00 CEST (01:00 UTC) it's CEST (+02:00)
    expect(berlinUtcOffset('2026-03-29 14:00:00')).toBe('+02:00');
  });
});

describe('parsePardokXml', () => {
  function buildXml(meetings: Array<{ id: string; committee: string; dateTime: string; dateTimeEnd?: string; title?: string }>): string {
    const rows = meetings.map((m) => `
      <row>
        <field name="Termin_ID">${m.id}</field>
        <field name="committee_name">${m.committee}</field>
        <field name="wahlperiode">20</field>
        <field name="date_time">${m.dateTime}</field>
        ${m.dateTimeEnd ? `<field name="date_time_end">${m.dateTimeEnd}</field>` : ''}
        <field name="title">${m.title ?? ''}</field>
      </row>
    `).join('\n');
    return `<?xml version="1.0"?><resultset>${rows}</resultset>`;
  }

  // Use a far-future winter date so berlinUtcOffset returns "+01:00" on all platforms
  const futureDate = '2099-01-15 10:00:00';
  const futureDateIso = '2099-01-15T10:00:00+01:00'; // CET
  const now = new Date('2099-01-01T00:00:00Z').getTime();
  const windowMs = 30 * 24 * 60 * 60 * 1000; // 30 days

  it('parses valid XML with meetings in window', () => {
    const xml = buildXml([{ id: '123', committee: 'Hauptausschuss', dateTime: futureDate }]);
    const result = parsePardokXml(xml, 'committee', now, windowMs);
    expect(result).toHaveLength(1);
    expect(result[0].committee).toBe('Hauptausschuss');
  });

  it('parses single-row XML correctly (not dropped as non-array)', () => {
    // fast-xml-parser returns an object (not array) for a single <row>,
    // which previously caused parsePardokXml to return []
    const xml = buildXml([{ id: '999', committee: 'Einzelsitzung', dateTime: futureDate }]);
    const result = parsePardokXml(xml, 'committee', now, windowMs);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pardok-999');
    expect(result[0].committee).toBe('Einzelsitzung');
  });

  it('filters out meetings outside the time window (past)', () => {
    const pastDate = '2098-12-01 10:00:00';
    const xml = buildXml([{ id: '123', committee: 'Test', dateTime: pastDate }]);
    const result = parsePardokXml(xml, 'committee', now, windowMs);
    expect(result).toHaveLength(0);
  });

  it('filters out meetings too far in the future', () => {
    const farFuture = '2100-01-01 10:00:00';
    const xml = buildXml([{ id: '123', committee: 'Test', dateTime: farFuture }]);
    const result = parsePardokXml(xml, 'committee', now, windowMs);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty resultset', () => {
    const xml = '<?xml version="1.0"?><resultset></resultset>';
    const result = parsePardokXml(xml, 'committee', now, windowMs);
    expect(result).toHaveLength(0);
  });

  it('applies correct Berlin CET offset to output ISO strings', () => {
    const xml = buildXml([{ id: '456', committee: 'Test', dateTime: futureDate }]);
    const result = parsePardokXml(xml, 'committee', now, windowMs);
    expect(result[0].start).toBe(futureDateIso);
  });

  it('produces correct id format (pardok-{Termin_ID})', () => {
    const xml = buildXml([{ id: '789', committee: 'Test', dateTime: futureDate }]);
    const result = parsePardokXml(xml, 'committee', now, windowMs);
    expect(result[0].id).toBe('pardok-789');
  });

  it('sets source to "parliament" and correct webUrl', () => {
    const xml = buildXml([{ id: '100', committee: 'Test', dateTime: futureDate }]);
    const result = parsePardokXml(xml, 'committee', now, windowMs);
    expect(result[0].source).toBe('parliament');
    expect(result[0].webUrl).toBe('https://www.parlament-berlin.de/termine');
  });
});

// ── Köln: one OParl 1.1 body (SOMACOS) ─────────────────────────

const KOELN_MEETINGS = 'https://buergerinfo.stadt-koeln.de/oparl/bodies/stadtverwaltung_koeln/meetings';
const KOELN: OparlTarget = {
  label: 'koeln',
  firstUrl: `${KOELN_MEETINGS}?limit=100`,
  districtBody: 'Bezirksvertretung',
  webUrlPrefix: 'https://buergerinfo.stadt-koeln.de/si0057.asp?__ksinr=',
};
const NOV_1 = new Date('2026-11-01T12:00:00Z').getTime();
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

describe('parseOparlMeetings (Köln, OParl 1.1)', () => {
  const page1 = JSON.parse(fixture('koeln-oparl-meetings-page1.json')).data;
  const page2 = JSON.parse(fixture('koeln-oparl-meetings-page2.json')).data;
  const page3 = JSON.parse(fixture('koeln-oparl-meetings-page3.json')).data;

  it('keeps only meetings in the 14-day window, though the list reaches years ahead', () => {
    const { meetings, anyInFuture } = parseOparlMeetings(page1, KOELN, NOV_1, FOURTEEN_DAYS);
    expect(anyInFuture).toBe(true);
    expect(meetings.map((m) => m.id)).toEqual([`${KOELN_MEETINGS}/36080`]);
  });

  it('files a Bezirksvertretung under its district and everything else under the council', () => {
    const { meetings } = parseOparlMeetings(page2, KOELN, NOV_1, FOURTEEN_DAYS);
    const lindenthal = meetings.find((m) => m.id.endsWith('/33978'))!;
    expect(lindenthal).toMatchObject({ source: 'bvv', district: 'Lindenthal', committee: 'Bezirksvertretung Lindenthal' });
    const rat = meetings.find((m) => m.id.endsWith('/33691'))!;
    expect(rat.source).toBe('parliament');
    expect(rat.district).toBeUndefined();
  });

  it('drops the end time SOMACOS gives as midnight before the start', () => {
    const { meetings } = parseOparlMeetings(page2, KOELN, NOV_1, FOURTEEN_DAYS);
    const lindenthal = meetings.find((m) => m.id.endsWith('/33978'))!;
    expect(lindenthal.start).toBe('2026-11-02T16:00:00+01:00');
    expect(lindenthal.end).toBeUndefined();
  });

  it('links each meeting to its SessionNet page and keeps room and agenda', () => {
    const { meetings } = parseOparlMeetings(page2, KOELN, NOV_1, FOURTEEN_DAYS);
    const lindenthal = meetings.find((m) => m.id.endsWith('/33978'))!;
    expect(lindenthal.webUrl).toBe('https://buergerinfo.stadt-koeln.de/si0057.asp?__ksinr=33978');
    expect(lindenthal.location).toBe('Großer Sitzungssaal');
    expect(lindenthal.agendaItems).toHaveLength(2);
  });

  it('reports a page of past meetings as having none ahead', () => {
    const { meetings, anyInFuture } = parseOparlMeetings(page3, KOELN, NOV_1, FOURTEEN_DAYS);
    expect(meetings).toEqual([]);
    expect(anyInFuture).toBe(false);
  });

  it('skips cancelled and non-public meetings', () => {
    const base = page1[1];
    const { meetings } = parseOparlMeetings(
      [{ ...base, cancelled: true }, { ...base, id: 'x', name: 'Nichtöffentliche Sitzung des Hauptausschusses' }],
      KOELN, NOV_1, FOURTEEN_DAYS,
    );
    expect(meetings).toEqual([]);
  });

  it('keeps Berlin’s fixed district and the server’s own web link', () => {
    const { meetings } = parseOparlMeetings(
      [{ id: 'b1', name: '12. Sitzung der BVV Mitte', start: '2026-11-05T17:00:00+01:00', end: '2026-11-05T21:00:00+01:00', web: 'https://example.org/b1' }],
      { label: 'Mitte', firstUrl: 'https://example.org/meetings.asp?body=1', district: 'Mitte' },
      NOV_1, FOURTEEN_DAYS,
    );
    expect(meetings[0]).toMatchObject({ source: 'bvv', district: 'Mitte', committee: 'BVV Mitte', end: '2026-11-05T21:00:00+01:00', webUrl: 'https://example.org/b1' });
  });
});

describe('fetchOparlMeetings', () => {
  afterEach(() => vi.restoreAllMocks());

  it('follows the next links until a page has nothing ahead', async () => {
    const pages: Record<string, string> = {
      [`${KOELN_MEETINGS}?limit=100`]: fixture('koeln-oparl-meetings-page1.json'),
      [`${KOELN_MEETINGS}?page=2&limit=100`]: fixture('koeln-oparl-meetings-page2.json'),
      [`${KOELN_MEETINGS}?page=3&limit=100`]: fixture('koeln-oparl-meetings-page3.json'),
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const body = pages[String(input)];
      return body ? new Response(body, { status: 200 }) : new Response('not found', { status: 404 });
    });

    const meetings = await fetchOparlMeetings(KOELN, NOV_1, FOURTEEN_DAYS);

    expect(fetchSpy).toHaveBeenCalledTimes(3); // page 4 is never asked for
    expect(meetings.map((m) => m.id.split('/').pop()).sort()).toEqual(['33691', '33978', '36080']);
  });
});

// ── München: RIS RSS ───────────────────────────────────────────

describe('parseRisTitle', () => {
  it('reads body and local time from a BA title, in CET', () => {
    expect(parseRisTitle('BA-Sitzung BA 16 - Vollgremium am Donnerstag, 12. November 2026, 19:30 Uhr'))
      .toEqual({ kind: 'BA', body: 'BA 16 - Vollgremium', start: '2026-11-12T19:30:00+01:00' });
  });

  it('applies summer time (CEST) to a date in July', () => {
    expect(parseRisTitle('StR-Sitzung Bauausschuss am Dienstag, 7. Juli 2026, 09:30 Uhr')?.start)
      .toBe('2026-07-07T09:30:00+02:00');
  });

  it('reads März and a trailing note', () => {
    expect(parseRisTitle('StR-Sitzung Mobilitätsausschuss am Mittwoch, 3. März 2027, 9:30 Uhr  im Anschluss an vorhergehende Sitzung.'))
      .toEqual({ kind: 'StR', body: 'Mobilitätsausschuss', start: '2027-03-03T09:30:00+01:00' });
  });

  it('returns null for a title it cannot read', () => {
    expect(parseRisTitle('StR-Sitzung Bauausschuss')).toBeNull();
    expect(parseRisTitle('StR-Sitzung Bauausschuss am Mittwoch, 31. Foo 2026, 09:30 Uhr')).toBeNull();
  });
});

describe('parseMuenchenRisFeed', () => {
  it('turns Stadtrat items into council meetings with room and RIS link', () => {
    const meetings = parseMuenchenRisFeed(fixture('muenchen-ris-str.xml'), NOV_1, FOURTEEN_DAYS);
    expect(meetings).toHaveLength(3);
    expect(meetings[0]).toEqual({
      id: 'muenchen-ris-9142825',
      source: 'parliament',
      committee: 'Gesundheitsausschuss',
      start: '2026-11-12T14:00:00+01:00',
      location: 'Großer Sitzungssaal',
      webUrl: 'https://risi.muenchen.de/risi/sitzung/detail/9142825',
    });
  });

  it('files BA items under the Stadtbezirk and decodes the double-encoded umlauts', () => {
    const meetings = parseMuenchenRisFeed(fixture('muenchen-ris-ba.xml'), NOV_1, FOURTEEN_DAYS);
    expect(meetings[0]).toMatchObject({
      id: 'muenchen-ris-9343298',
      source: 'bvv',
      district: 'Ramersdorf-Perlach',
      committee: 'Bezirksausschuss 16 – Vollgremium',
      start: '2026-11-12T19:30:00+01:00',
    });
    expect(meetings[0].location).toBe('Pfarrsaal der Kath. Pfarrgemeinde Christus Erlöser (St. Stephan), Lüdersstr. 12, 81737 München, Hinweis: barrierefreier Zugang möglich');
    expect(meetings[1].district).toBe('Schwanthalerhöhe');
  });

  it('leaves out meetings outside the window', () => {
    const later = new Date('2026-11-11T12:00:00Z').getTime();
    const meetings = parseMuenchenRisFeed(fixture('muenchen-ris-str.xml'), later, FOURTEEN_DAYS);
    expect(meetings.map((m) => m.committee)).toEqual(['Gesundheitsausschuss']);
  });

  it('returns nothing for a broken feed', () => {
    expect(parseMuenchenRisFeed('<html>error</html>', NOV_1, FOURTEEN_DAYS)).toEqual([]);
  });
});

describe('buergerschaftSearchUrl', () => {
  it('asks for 50 hits from today on, earliest first, in the gzipped state', () => {
    const url = new URL(buergerschaftSearchUrl('https://www.hamburgische-buergerschaft.de/aktuelles/termine/1042880!search'));
    expect(url.pathname).toBe('/aktuelles/termine/1042880!search');
    const state = JSON.parse(gunzipSync(Buffer.from(url.searchParams.get('state')!, 'base64url')).toString('utf8'));
    expect(state).toMatchObject({ dateFrom: null, dateTo: null, hitsPerPage: 50, sort: 'externallydisplayeddate asc' });
  });
});

describe('parseBuergerschaftCalendar (Hamburg)', () => {
  const NOV_2 = new Date('2026-11-02T03:00:00Z').getTime();
  const html = fixture('hamburg-buergerschaft-termine.html');

  it('keeps public committee and plenary sessions with room and agenda link', () => {
    const meetings = parseBuergerschaftCalendar(html, NOV_2, FOURTEEN_DAYS);
    expect(meetings).toEqual([
      {
        id: 'hh-buergerschaft-1104768',
        source: 'parliament',
        committee: 'Haushaltsausschuss',
        start: '2026-11-03T17:00:00+01:00',
        location: 'AP6, Sitzungssaal 2.04, 2. Obergeschoss, Adolphsplatz 6, 20457 Hamburg',
        webUrl: 'https://www.hamburgische-buergerschaft.de/resource/blob/1104770/7a891eab7b543ddfb41d6a64faa63862/261103-dl-data.pdf',
      },
      {
        id: 'hh-buergerschaft-1078320',
        source: 'parliament',
        committee: 'Bürgerschaftssitzung',
        start: '2026-11-11T13:30:00+01:00',
        location: 'Plenarsaal im Rathaus, Rathausmarkt 1, 20095 Hamburg',
        webUrl: 'https://www.hamburgische-buergerschaft.de/resource/blob/1078322/f4bef770acb09d1fd42718770897626c/261111-dl-data.pdf',
      },
    ]);
  });

  it('leaves out non-public and cancelled sessions, the Präsidium, advisory boards and the slider after the list', () => {
    const meetings = parseBuergerschaftCalendar(html, NOV_2, 60 * 24 * 60 * 60 * 1000);
    // Not the Eingabenausschuss (nicht öffentlich), the cancelled Verfassungsausschuss,
    // the NSU Beirat, the delegation trip, or the past plenary of 14 October
    expect(meetings.map((m) => m.id)).toEqual([
      'hh-buergerschaft-1104768', 'hh-buergerschaft-1078320', 'hh-buergerschaft-1078326',
    ]);
    // Without an agenda yet, the link is the calendar
    expect(meetings[2].webUrl).toBe('https://www.hamburgische-buergerschaft.de/aktuelles/termine');
  });

  it('dates a January session after a December today in the next year, in CET', () => {
    const teaser = html.split('<div class="bkhh-teaser bkhh-teaser--events" >')[3]!
      .replace('aria-label="03. November"', 'aria-label="05. Januar"');
    const page = `<div class="bkhh-teaser bkhh-teaser--events" >${teaser}`;
    const dec20 = new Date('2026-12-20T12:00:00Z').getTime();
    const [meeting] = parseBuergerschaftCalendar(page, dec20, 30 * 24 * 60 * 60 * 1000);
    expect(meeting?.start).toBe('2027-01-05T17:00:00+01:00');
    // A session on today's date stays this year
    expect(parseBuergerschaftCalendar(page.replace('05. Januar', '20. Dezember'), dec20, FOURTEEN_DAYS)[0]?.start)
      .toBe('2026-12-20T17:00:00+01:00');
  });

  it('returns nothing for a page without teasers', () => {
    expect(parseBuergerschaftCalendar('<html>Wartungsarbeiten</html>', NOV_2, FOURTEEN_DAYS)).toEqual([]);
  });
});
