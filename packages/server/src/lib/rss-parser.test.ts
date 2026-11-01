import { describe, it, expect } from 'vitest';
import { parseFeed } from './rss-parser.js';

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Berlin traffic disruption</title>
      <link>https://example.com/1</link>
      <pubDate>Mon, 01 Mar 2026 10:00:00 GMT</pubDate>
      <description>Major road closure in Mitte</description>
    </item>
    <item>
      <title>New museum exhibition</title>
      <link>https://example.com/2</link>
      <pubDate>Sun, 28 Feb 2026 08:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom article</title>
    <link href="https://example.com/atom/1" />
    <published>2026-03-01T12:00:00Z</published>
    <summary>Summary text</summary>
  </entry>
</feed>`;

// RSS 1.0 (RDF), as BR24 serves it: items are siblings of <channel>, the date is dc:date.
const RDF_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://example.com/rdf">
    <title>Oberbayern</title>
    <link>https://example.com</link>
    <items><rdf:Seq>
      <rdf:li rdf:resource="https://example.com/rdf/1"/>
      <rdf:li rdf:resource="https://example.com/rdf/2"/>
    </rdf:Seq></items>
  </channel>
  <item rdf:about="https://example.com/rdf/1">
    <title>Tram 25 f&#228;hrt wieder</title>
    <link>https://example.com/rdf/1</link>
    <description>Ersatzverkehr endet am Montag.</description>
    <dc:date>2026-11-01T18:55:32.204Z</dc:date>
  </item>
  <item rdf:about="https://example.com/rdf/2">
    <title>Ohne Link im link-Element</title>
    <description>Nur rdf:about</description>
  </item>
</rdf:RDF>`;

describe('parseFeed', () => {
  it('parses RSS 1.0 (RDF) feed', () => {
    const items = parseFeed(RDF_FEED);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Tram 25 fährt wieder',
      url: 'https://example.com/rdf/1',
      description: 'Ersatzverkehr endet am Montag.',
      publishedAt: '2026-11-01T18:55:32.204Z',
    });
    // Without <link>, the item's rdf:about is its URL.
    expect(items[1]!.url).toBe('https://example.com/rdf/2');
  });

  it('parses an RDF feed with a single item', () => {
    const xml = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/">
  <channel rdf:about="https://example.com"><title>T</title></channel>
  <item rdf:about="https://example.com/a"><title>A</title><link>https://example.com/a</link></item>
</rdf:RDF>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('A');
  });

  it('returns empty array for an RDF feed without items', () => {
    const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><channel><title>T</title></channel></rdf:RDF>`;
    expect(parseFeed(xml)).toEqual([]);
  });

  it('decodes numeric and HTML character references in titles and descriptions', () => {
    // rbb24 encodes umlauts as numeric references.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>rbb24</title>
  <item>
    <title>VfL Potsdam schl&#228;gt Essen &#x2013; 2. Runde</title>
    <link>https://example.com/1</link>
    <description>Stra&#223;e gesperrt&nbsp;&amp; umgeleitet</description>
  </item>
</channel></rss>`;
    const [item] = parseFeed(xml);
    expect(item!.title).toBe('VfL Potsdam schlägt Essen – 2. Runde');
    expect(item!.description).toBe('Straße gesperrt & umgeleitet');
  });

  it('parses RSS 2.0 feed', () => {
    const items = parseFeed(RSS_FEED);
    expect(items).toHaveLength(2);
    expect(items[0]!.title).toBe('Berlin traffic disruption');
    expect(items[0]!.url).toBe('https://example.com/1');
    expect(items[0]!.description).toBe('Major road closure in Mitte');
  });

  it('parses Atom feed', () => {
    const items = parseFeed(ATOM_FEED);
    expect(items).toHaveLength(1);
    expect(items[0]!.title).toBe('Atom article');
    expect(items[0]!.url).toBe('https://example.com/atom/1');
  });

  it('returns empty array for invalid XML', () => {
    const items = parseFeed('not xml');
    expect(items).toEqual([]);
  });

  it('returns empty array for empty feed', () => {
    const items = parseFeed('<rss><channel></channel></rss>');
    expect(items).toEqual([]);
  });
});
