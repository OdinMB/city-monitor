/**
 * Streaming reader for Hamburg Tourismus' Veranstaltungsdatenbank export
 * (hamburg25.xml, about 68 MB). SAX, so neither the document nor a DOM is ever
 * held: each venue (POI) and each event goes to the caller as its element
 * closes, cut down to the fields the mapping in hht-events.ts needs. Venue
 * descriptions, images and everything else in the export are never kept.
 */
import { SaxesParser, type SaxesTagPlain } from 'saxes';

export interface HhtText { de?: string; en?: string }

export interface HhtPoi {
  id: string;
  /** German title */
  title?: string;
  /** The address's city, else the geo record's; as exported (untrimmed case) */
  city?: string;
}

export interface HhtRawDate {
  date: string;
  startTime?: string;
  duration?: string;
  bookingLink?: string;
  cancelled: boolean;
}

export interface HhtRawEvent {
  id: string;
  entityState?: string;
  clientId?: string;
  title: HhtText;
  shortDescription: HhtText;
  description: HhtText;
  link: HhtText;
  bookingLink: HhtText;
  /** The venue's POI id */
  locationId?: string;
  /** German category names, in export order */
  categories: string[];
  pricing: { fromPrice?: string; toPrice?: string; absolutePrice?: string; freeOfCharge?: string };
  dates: HhtRawDate[];
}

export interface HhtExportHandlers {
  onPoi(poi: HhtPoi): void;
  onEvent(event: HhtRawEvent): void;
}

/** data > pois|events > HhtAddressPoi|Event */
const ITEM_DEPTH = 3;
type TextField = 'title' | 'shortDescription' | 'description' | 'link' | 'bookingLink';
const TEXT_FIELDS = new Set<string>(['title', 'shortDescription', 'description', 'link', 'bookingLink']);
type PriceField = keyof HhtRawEvent['pricing'];
const PRICE_FIELDS = new Set<string>(['fromPrice', 'toPrice', 'absolutePrice', 'freeOfCharge']);
type DateField = 'date' | 'startTime' | 'duration' | 'bookingLink';
const DATE_FIELDS = new Set<string>(['date', 'startTime', 'duration', 'bookingLink']);

function newEvent(id: string): HhtRawEvent {
  return {
    id, title: {}, shortDescription: {}, description: {}, link: {}, bookingLink: {},
    categories: [], pricing: {}, dates: [],
  };
}

/** Reads the export from a byte (or text) stream; rejects on malformed or truncated XML. */
export async function readHhtExport(
  source: AsyncIterable<Uint8Array | string>,
  handlers: HhtExportHandlers,
): Promise<void> {
  const parser = new SaxesParser();
  const stack: string[] = [];
  let text = '';
  let poi: (HhtPoi & { addressCity?: string; geoCity?: string }) | null = null;
  let event: HhtRawEvent | null = null;
  let date: HhtRawDate | null = null;

  parser.on('opentag', (tag: SaxesTagPlain) => {
    stack.push(tag.name);
    text = '';
    const depth = stack.length;
    const id = tag.attributes.id;
    if (depth === ITEM_DEPTH) {
      if (stack[1] === 'pois' && id) poi = { id };
      else if (stack[1] === 'events' && tag.name === 'Event' && id) event = newEvent(id);
      return;
    }
    if (!event || depth !== ITEM_DEPTH + 2) return;
    const parent = stack[ITEM_DEPTH];
    if (parent === 'client' && id) event.clientId = id;
    else if (parent === 'location' && tag.name === 'Addressbase' && id) event.locationId = id;
    else if (parent === 'eventDates' && tag.name === 'EventDate') date = { date: '', cancelled: false };
  });

  const append = (t: string) => {
    if (poi || event) text += t;
  };
  parser.on('text', append);
  parser.on('cdata', append);

  parser.on('closetag', () => {
    const value = text.trim();
    text = '';
    const rel = stack.slice(ITEM_DEPTH).join('/');
    if (poi) {
      if (rel === 'title/I18n/de' && value) poi.title = value;
      else if (rel === 'contact1/address/city' && value) poi.addressCity = value;
      else if (rel === 'geoInfo/GeoInfo/city' && value) poi.geoCity = value;
      else if (rel === '') {
        handlers.onPoi({ id: poi.id, title: poi.title, city: poi.addressCity ?? poi.geoCity });
        poi = null;
      }
    } else if (event) {
      closeEventField(event, rel.split('/'), value);
      if (rel === '') {
        handlers.onEvent(event);
        event = null;
      }
    }
    stack.pop();
  });

  function closeEventField(ev: HhtRawEvent, path: string[], value: string): void {
    const [field, second, third] = path;
    if (path.length === 1 && field === 'entityState') ev.entityState = value;
    else if (path.length === 3 && second === 'I18n' && TEXT_FIELDS.has(field!) && (third === 'de' || third === 'en')) {
      if (value) ev[field as TextField][third] = value;
    } else if (path.length === 2 && field === 'pricing' && PRICE_FIELDS.has(second!)) {
      if (value) ev.pricing[second as PriceField] = value;
    } else if (path.length === 5 && field === 'categories' && path.join('/') === 'categories/Category/i18nName/I18n/de') {
      if (value) ev.categories.push(value);
    } else if (date && field === 'eventDates' && second === 'EventDate') {
      if (path.length === 3 && third === 'cancelled') date.cancelled = value === 'true';
      else if (path.length === 3 && DATE_FIELDS.has(third!)) {
        if (value) date[third as DateField] = value;
      } else if (path.length === 2) {
        if (date.date) ev.dates.push(date);
        date = null;
      }
    }
  }

  const decoder = new TextDecoder('utf-8');
  for await (const chunk of source) {
    parser.write(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }));
  }
  parser.write(decoder.decode());
  parser.close();
}
