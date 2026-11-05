import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readHhtExport, type HhtPoi, type HhtRawEvent } from './hht-xml.js';

const FIXTURE = readFileSync(new URL('./hht-fixtures/export-sample.xml', import.meta.url));

async function* chunked(buf: Buffer, size: number): AsyncGenerator<Buffer> {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

async function read(buf: Buffer, size: number) {
  const pois: HhtPoi[] = [];
  const events: HhtRawEvent[] = [];
  await readHhtExport(chunked(buf, size), { onPoi: (p) => pois.push(p), onEvent: (e) => events.push(e) });
  return { pois, events };
}

describe('readHhtExport', () => {
  it("keeps only each venue's id, German title and city", async () => {
    const { pois } = await read(FIXTURE, 4096);
    expect(pois).toEqual([
      { id: '5001', title: 'Testhalle am Beispielkanal', city: 'Hamburg' },
      { id: '5002', title: 'Platzhalter-Markt', city: 'HAMBURG' },
      { id: '5003', title: 'Musterbühne Umland', city: 'Norderstedt' },
    ]);
  });

  it('reads the fields the mapping needs from an event, not those of its images', async () => {
    const { events } = await read(FIXTURE, 4096);
    expect(events.map((e) => e.id)).toEqual(['900001', '900002', '900003', '900004', '900005', '900006', '900007']);
    expect(events[0]).toEqual({
      id: '900001',
      entityState: 'PUBLISHED',
      clientId: '725',
      title: { de: 'Konzert der Platzhalter', en: 'Concert of the Placeholders' },
      shortDescription: {
        de: '<p>Ein Abend f&uuml;r Stra&szlig;enmusik &ndash; mit &bdquo;Liedern&ldquo; &amp; mehr.</p>',
        en: '<p>An evening of street music.</p>',
      },
      description: {},
      link: { de: 'https://example.org/konzert', en: 'https://example.org/en/concert' },
      bookingLink: { de: 'https://example.org/konzert/tickets' },
      locationId: '5001',
      categories: ['Konzerte'],
      pricing: { fromPrice: '12.0', toPrice: '24.5', freeOfCharge: 'false' },
      dates: [
        { date: '2030-05-09', startTime: '20:00:00', duration: '120', cancelled: false },
        { date: '2030-05-12', startTime: '19:30:00', duration: '150', bookingLink: 'https://example.org/tickets?date=1002&ref=test', cancelled: true },
        { date: '2030-05-11', startTime: '20:00:00', duration: '150', bookingLink: 'https://example.org/tickets?date=1003&ref=test', cancelled: false },
      ],
    });
  });

  it('reads the client id whatever the client element is called', async () => {
    const { events } = await read(FIXTURE, 4096);
    expect(events[1]!.clientId).toBe('77');
    expect(events[1]!.pricing).toEqual({ absolutePrice: '49.9', freeOfCharge: 'true' });
  });

  it('keeps multi-byte characters split across chunks intact', async () => {
    const { pois, events } = await read(FIXTURE, 1);
    expect(pois[2]!.title).toBe('Musterbühne Umland');
    expect(events[3]!.categories).toEqual(['Märkte', 'Wochenmärkte']);
  });

  it('rejects a truncated export', async () => {
    const truncated = Buffer.from('<data><events><Event id="1"><title>');
    await expect(read(truncated, 8)).rejects.toThrow();
  });
});
