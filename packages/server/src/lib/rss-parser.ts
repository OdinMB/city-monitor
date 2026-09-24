/**
 * RSS/Atom feed parser using fast-xml-parser.
 */

import { XMLParser } from 'fast-xml-parser';

export interface FeedItem {
  title: string;
  url: string;
  publishedAt: string;
  description?: string;
  imageUrl?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  // Numeric (&#228;) and common HTML (&nbsp;) references — rbb24 encodes umlauts this way.
  htmlEntities: true,
});

export function parseFeed(xml: string): FeedItem[] {
  try {
    const doc = parser.parse(xml);

    // RSS 2.0
    if (doc.rss?.channel) {
      const items = doc.rss.channel.item;
      if (!items) return [];
      const arr = Array.isArray(items) ? items : [items];
      return arr.map(parseRssItem).filter((i): i is FeedItem => i !== null);
    }

    // Atom
    if (doc.feed?.entry) {
      const entries = doc.feed.entry;
      const arr = Array.isArray(entries) ? entries : [entries];
      return arr.map(parseAtomEntry).filter((i): i is FeedItem => i !== null);
    }

    return [];
  } catch {
    return [];
  }
}

function parseRssItem(item: Record<string, unknown>): FeedItem | null {
  const title = extractText(item.title);
  const url = extractText(item.link);
  if (!title || !url) return null;

  return {
    title,
    url,
    publishedAt: extractText(item.pubDate) || new Date().toISOString(),
    description: extractText(item.description),
    imageUrl: extractMediaUrl(item),
  };
}

function parseAtomEntry(entry: Record<string, unknown>): FeedItem | null {
  const title = extractText(entry.title);
  const link = entry.link;
  const url = typeof link === 'object' && link !== null
    ? (link as Record<string, unknown>)['@_href'] as string
    : extractText(link);
  if (!title || !url) return null;

  return {
    title,
    url,
    publishedAt: extractText(entry.published) || extractText(entry.updated) || new Date().toISOString(),
    description: extractText(entry.summary) || extractText(entry.content),
  };
}

function extractText(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && '#text' in (value as object)) {
    return String((value as Record<string, unknown>)['#text']).trim();
  }
  return undefined;
}

function extractMediaUrl(item: Record<string, unknown>): string | undefined {
  const enclosure = item.enclosure;
  if (typeof enclosure === 'object' && enclosure !== null) {
    const url = (enclosure as Record<string, unknown>)['@_url'];
    if (typeof url === 'string') return url;
  }
  return undefined;
}
