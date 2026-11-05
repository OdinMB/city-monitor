import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { HHT_CATEGORIES, hhtCategory, hhtPrice, parseHhtExport } from './hht-events.js';

const FIXTURE = readFileSync(new URL('./hht-fixtures/export-sample.xml', import.meta.url));
/** 12:00 in Hamburg */
const NOW = new Date('2030-05-10T10:00:00Z');

async function* once(buf: Buffer): AsyncGenerator<Buffer> {
  yield buf;
}

describe('parseHhtExport', () => {
  it('keeps one event per published Hamburg event with a date in the next 14 days, soonest first', async () => {
    const events = await parseHhtExport(once(FIXTURE), NOW);
    // 900003 is outside Hamburg, 900005 cancelled, 900006 too far ahead, 900007 has no German title
    expect(events.map((e) => e.id)).toEqual(['hht-900002', 'hht-900001', 'hht-900004']);
  });

  it('maps an event onto its next non-cancelled date, with German text and both links', async () => {
    const [, concert] = await parseHhtExport(once(FIXTURE), NOW);
    expect(concert).toEqual({
      id: 'hht-900001',
      title: 'Konzert der Platzhalter',
      venue: 'Testhalle am Beispielkanal',
      date: '2030-05-11T20:00:00',
      category: 'music',
      url: 'https://example.org/konzert',
      bookingUrl: 'https://example.org/tickets?date=1003&ref=test',
      description: 'Ein Abend für Straßenmusik – mit „Liedern“ & mehr.',
      price: '12–24,50 €',
      source: 'hht',
    });
  });

  it("omits the price of CTS EVENTIM's events (client 77)", async () => {
    const [show] = await parseHhtExport(once(FIXTURE), NOW);
    expect(show!.id).toBe('hht-900002');
    expect(show!.price).toBeUndefined();
    expect(show!.free).toBeUndefined();
    expect(show!.bookingUrl).toBe('https://example.org/ticketing/2001');
  });

  it("falls back to the description, the English link and the event's booking link", async () => {
    const market = (await parseHhtExport(once(FIXTURE), NOW))[2]!;
    expect(market).toMatchObject({
      venue: 'Platzhalter-Markt',
      date: '2030-05-13T08:00:00',
      category: 'market',
      url: 'https://example.org/en/market',
      bookingUrl: 'https://example.org/markt/buchen',
      description: 'Obst & Gemüse aus der Region.',
      free: true,
    });
    expect(market.price).toBeUndefined();
  });

  it('never carries venue descriptions, images or English text', async () => {
    const json = JSON.stringify(await parseHhtExport(once(FIXTURE), NOW));
    for (const leaked of ['Ortsbeschreibung', 'Bildtitel', 'bild.jpg', 'image-link', 'Concert of the Placeholders', 'street music']) {
      expect(json).not.toContain(leaked);
    }
  });

  it('drops a date that has already started', async () => {
    const events = await parseHhtExport(once(FIXTURE), new Date('2030-05-10T17:00:00Z')); // 19:00 in Hamburg
    expect(events.map((e) => e.id)).toEqual(['hht-900001', 'hht-900004']);
  });
});

describe('hhtCategory', () => {
  it('maps all 97 categories of the export', () => {
    expect(Object.keys(HHT_CATEGORIES)).toHaveLength(97);
  });

  it.each([
    ['Konzerte', 'music'], ['Klassik', 'music'], ['Party', 'music'],
    ['Ausstellungen', 'art'], ['Film, Kino, TV', 'art'], ['Lesungen', 'art'],
    ['Theater & Bühne', 'theater'], ['Musicals', 'theater'], ['Comedy', 'theater'],
    ['Wochenmärkte', 'market'], ['Flohmärkte', 'market'], ['Weihnachtsmärkte', 'market'],
    ['Fußball', 'sport'], ['Yoga', 'sport'], ['Radtouren', 'sport'],
    ['Straßenfeste', 'community'], ['Seminare, Kurse & Workshops', 'community'], ['Begegnungsangebote', 'community'],
    ['Ausstellungen & Museen', 'museum'], ['Dauerausstellungen', 'museum'],
    ['Messen', 'other'], ['Hafenrundfahrten', 'other'], ['Sonstige', 'other'],
  ] as const)('%s → %s', (name, category) => {
    expect(hhtCategory([name])).toBe(category);
  });

  it('takes the first category that says more than other', () => {
    expect(hhtCategory(['Sonstige', 'Rock', 'Theater'])).toBe('music');
  });

  it('treats an unknown or missing category as other', () => {
    expect(hhtCategory(['Neue Kategorie'])).toBe('other');
    expect(hhtCategory([])).toBe('other');
  });
});

describe('hhtPrice', () => {
  it.each([
    [{ fromPrice: '12.0', toPrice: '24.5' }, '12–24,50 €'],
    [{ fromPrice: '10', toPrice: '10.0' }, '10 €'],
    [{ absolutePrice: '49.9' }, '49,90 €'],
    [{ fromPrice: '8' }, 'ab 8 €'],
    [{ toPrice: '15' }, 'bis 15 €'],
    [{ fromPrice: '0.0', toPrice: '0.0' }, undefined],
    [{ fromPrice: 'abc' }, undefined],
    [{}, undefined],
  ])('%o → %s', (pricing, expected) => {
    expect(hhtPrice(pricing)).toBe(expected);
  });
});
