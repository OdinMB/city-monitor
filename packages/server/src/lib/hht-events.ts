/**
 * Hamburg Tourismus' Veranstaltungsdatenbank export mapped onto CityEvents.
 * Rules from the HHT contract and the source's notes in
 * .context/events-safety.md: German text only, no images, no venue
 * descriptions, the event link and the booking link apart, and no price for
 * CTS EVENTIM's events (client 77, contract 2.11).
 */
import type { CityEvent } from '@city-monitor/shared';
import { readHhtExport, type HhtPoi, type HhtRawDate, type HhtRawEvent } from './hht-xml.js';
import { toTeaser } from './teaser.js';

/** CTS EVENTIM: its prices must not be shown (contract 2.11). */
const PRICELESS_CLIENT_ID = '77';
const DESCRIPTION_MAX_CHARS = 500;
const DEFAULT_LOOKAHEAD_DAYS = 14;

type Category = CityEvent['category'];

/** Every category in the export, by its German name (97 in 2026). */
export const HHT_CATEGORIES: Record<string, Category> = {
  // Concerts and other music
  'Konzerte': 'music', 'HipHop, RnB, Soul & Funk': 'music', 'Elektro': 'music',
  'Jazz, Blues, Swing & Chanson': 'music', 'Rock': 'music', 'Schlager & Volksmusik': 'music',
  'Weitere Konzerte': 'music', 'Pop': 'music', 'Klassik': 'music', 'Indie & Alternative': 'music',
  'Country & Folk': 'music', 'Weltmusik': 'music', 'Reggae, Dancehall & Ska': 'music',
  'Gospel & Chöre': 'music', 'Punkrock, Metal & Hardcore': 'music', 'Singer/Songwriter': 'music',
  'Party': 'music', 'Singen & Musizieren': 'music',
  // Exhibitions, film, literature
  'Ausstellungen': 'art', 'Film, Kino, TV': 'art', 'Lesungen': 'art',
  // Museums
  'Ausstellungen & Museen': 'museum', 'Dauerausstellungen': 'museum', 'Ausstellungsführungen': 'museum',
  // Stage
  'Theater & Bühne': 'theater', 'Theater': 'theater', 'Ballett & Tanz': 'theater',
  'Oper & Operette': 'theater', 'Weitere Theater & Bühne': 'theater', 'Comedy': 'theater',
  'Poetry Slam': 'theater', 'Kabarett': 'theater', 'Musicals & Shows': 'theater',
  'Musicals': 'theater', 'Shows': 'theater', 'Zirkus': 'theater',
  // Markets
  'Märkte': 'market', 'Flohmärkte': 'market', 'Wochenmärkte': 'market', 'Weihnachtsmärkte': 'market',
  'Kunsthandwerkermärkte': 'market', 'Weitere Märkte': 'market', 'Jahrmärkte': 'market',
  // Sport
  'Sport & Bewegung': 'sport', 'Radtouren': 'sport', 'Basketball': 'sport', 'Handball': 'sport',
  'Fußball': 'sport', 'Golf': 'sport', 'Hockey': 'sport', 'Laufen': 'sport', 'Radsport': 'sport',
  'Segeln': 'sport', 'Wassersport': 'sport', 'Weitere Sport & Bewegung': 'sport', 'Reiten': 'sport',
  'Kampfsport': 'sport', 'Tennis': 'sport', 'Eishockey': 'sport', 'Motorsport': 'sport',
  'Yoga': 'sport', 'Gymnastik': 'sport', 'Volleyball': 'sport', 'Fitness': 'sport',
  'Tanzen': 'sport', 'Turnen': 'sport',
  // Festivals, learning, civic and social life
  'Festivals & Feste': 'community', 'Festivals': 'community', 'Straßenfeste': 'community',
  'Feste': 'community', 'Seminare, Kurse & Workshops': 'community',
  'Vorträge & Diskussionsrunden': 'community', 'Bildung': 'community', 'Fortbildungen': 'community',
  'Weiterbildungen': 'community', 'Weitere Bildungsangebote': 'community',
  'Bürgerangebote & Soziales': 'community', 'Soziale Dienste & Angebote': 'community',
  'Sitzungen': 'community', 'Information & Beratung': 'community', 'Begegnungsangebote': 'community',
  'Religion & Spiritualität': 'community', 'Kundgebungen & Demos': 'community',
  'Spielen, Quizzen & Gaming': 'community',
  // Tours, trade fairs and the rest
  'Rundgänge & Fahrten': 'other', 'Stadtrundfahrten': 'other', 'Ausflugsfahrten': 'other',
  'Hafenrundfahrten': 'other', 'Bootstouren': 'other', 'Stadtrundgänge & Führungen': 'other',
  'Exkursionen & Wanderungen': 'other', 'Messen': 'other', 'Fachmessen': 'other',
  'Verbrauchermessen': 'other', 'Kongresse, Konferenzen & Tagungen': 'other',
  'Schiffsankünfte': 'other', 'Sonstige': 'other',
};

/** The first of an event's categories that says more than 'other'. */
export function hhtCategory(names: string[]): Category {
  for (const name of names) {
    const category = HHT_CATEGORIES[name];
    if (category && category !== 'other') return category;
  }
  return 'other';
}

function euros(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function formatEuros(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace('.', ',');
}

/** The export's pricing as German text: "49,90 €", "12–24,50 €", "ab 8 €", "bis 15 €". */
export function hhtPrice(pricing: HhtRawEvent['pricing']): string | undefined {
  const absolute = euros(pricing.absolutePrice);
  if (absolute) return `${formatEuros(absolute)} €`;
  const from = euros(pricing.fromPrice);
  const to = euros(pricing.toPrice);
  if (from && to) return from === to ? `${formatEuros(from)} €` : `${formatEuros(from)}–${formatEuros(to)} €`;
  if (from) return `ab ${formatEuros(from)} €`;
  if (to) return `bis ${formatEuros(to)} €`;
  return undefined;
}

/** Hamburg's wall-clock time, like the export's offset-less dates: "2030-05-10T12:00:00". */
function hamburgLocal(now: Date): string {
  return now.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin', hourCycle: 'h23' }).replace(' ', 'T');
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

function startOf(d: HhtRawDate): string {
  const time = d.startTime && /^\d{2}:\d{2}:\d{2}$/.test(d.startTime) ? d.startTime : '00:00:00';
  return `${d.date}T${time}`;
}

function nextDate(dates: HhtRawDate[], nowLocal: string, lastDay: string): HhtRawDate | undefined {
  let best: HhtRawDate | undefined;
  for (const d of dates) {
    if (d.cancelled || !/^\d{4}-\d{2}-\d{2}$/.test(d.date) || d.date > lastDay) continue;
    if (startOf(d) < nowLocal) continue;
    if (!best || startOf(d) < startOf(best)) best = d;
  }
  return best;
}

function isHamburg(poi: HhtPoi | undefined): poi is HhtPoi {
  return poi?.city?.trim().toLowerCase() === 'hamburg';
}

/**
 * Collects the export's venues and its candidate events while the stream is
 * read, then maps the candidates whose venue is in Hamburg. Venues are matched
 * at the end, so the order of the two sections does not matter.
 */
export function createHhtCollector(now: Date, lookaheadDays = DEFAULT_LOOKAHEAD_DAYS) {
  const nowLocal = hamburgLocal(now);
  const lastDay = addDays(nowLocal.slice(0, 10), lookaheadDays);
  const pois = new Map<string, HhtPoi>();
  const candidates: Array<{ raw: HhtRawEvent; date: HhtRawDate }> = [];

  return {
    onPoi(poi: HhtPoi): void {
      pois.set(poi.id, { id: poi.id, title: poi.title, city: poi.city });
    },
    onEvent(raw: HhtRawEvent): void {
      if (raw.entityState !== 'PUBLISHED' || !raw.title.de || !raw.locationId) return;
      const date = nextDate(raw.dates, nowLocal, lastDay);
      if (!date) return;
      // Drop what the mapping never uses before holding on to it
      candidates.push({
        raw: { ...raw, title: { de: raw.title.de }, shortDescription: { de: raw.shortDescription.de }, description: { de: raw.description.de }, dates: [] },
        date,
      });
    },
    finish(): CityEvent[] {
      const events: CityEvent[] = [];
      for (const { raw, date } of candidates) {
        const venue = pois.get(raw.locationId!);
        if (!isHamburg(venue)) continue;
        events.push(toCityEvent(raw, date, venue));
      }
      return events.sort((a, b) => a.date.localeCompare(b.date));
    },
  };
}

function toCityEvent(raw: HhtRawEvent, date: HhtRawDate, venue: HhtPoi): CityEvent {
  const url = raw.link.de || raw.link.en || '';
  const bookingUrl = date.bookingLink || raw.bookingLink.de || raw.bookingLink.en;
  const priceless = raw.clientId === PRICELESS_CLIENT_ID;
  const free = !priceless && raw.pricing.freeOfCharge === 'true';
  return {
    id: `hht-${raw.id}`,
    title: raw.title.de!,
    venue: venue.title || undefined,
    date: startOf(date),
    category: hhtCategory(raw.categories),
    url,
    bookingUrl: bookingUrl && bookingUrl !== url ? bookingUrl : undefined,
    description: toTeaser(raw.shortDescription.de || raw.description.de, DESCRIPTION_MAX_CHARS),
    free: free || undefined,
    price: priceless || free ? undefined : hhtPrice(raw.pricing),
    source: 'hht',
  };
}

/** Reads a whole export stream and returns its Hamburg events in the lookahead window. */
export async function parseHhtExport(
  source: AsyncIterable<Uint8Array | string>,
  now: Date,
  lookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
): Promise<CityEvent[]> {
  const collector = createHhtCollector(now, lookaheadDays);
  await readHhtExport(source, collector);
  return collector.finish();
}
