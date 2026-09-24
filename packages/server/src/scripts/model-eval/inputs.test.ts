import { describe, it, expect } from 'vitest';
import type { NewsItem } from '@city-monitor/shared';
import { buildBriefingInputs, parseArchiveList, parseReleaseBody } from './inputs.js';
import type { NormalizedVerdict } from './extraction-scoring.js';

const NOW = new Date('2026-09-24T12:00:00Z');
const HOUR = 3_600_000;

function item(id: string, hoursAgo: number | 'undated', over: Partial<NewsItem> = {}): NewsItem {
  return {
    id,
    title: `Headline ${id}`,
    url: `https://example.com/${id}`,
    publishedAt: hoursAgo === 'undated' ? 'not a date' : new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(),
    sourceName: 'rbb24',
    sourceUrl: 'https://example.com/feed',
    category: 'local',
    tier: 1,
    lang: 'de',
    ...over,
  };
}

function verdicts(items: NewsItem[], over: Record<string, Partial<NormalizedVerdict> | null> = {}): Map<string, NormalizedVerdict> {
  const map = new Map<string, NormalizedVerdict>();
  for (const it of items) {
    if (over[it.id] === null) continue;
    map.set(it.id, { relevant_to_city: true, category: 'local', importance: 0.8, ...over[it.id] });
  }
  return map;
}

const titles = (input: { items: Array<{ title: string }> }) => input.items.map((i) => i.title);

describe('buildBriefingInputs', () => {
  it('drops windows with fewer than 8 briefing items', () => {
    const items = Array.from({ length: 7 }, (_, i) => item(`a${i}`, 1));
    expect(buildBriefingInputs(items, verdicts(items), NOW)).toEqual([]);
  });

  it('drops a window whose top 10 repeats a window already kept', () => {
    // Items 5h old fall into both the `now` window and the `now − 4h` window.
    const items = Array.from({ length: 10 }, (_, i) => item(`a${i}`, 5));
    const inputs = buildBriefingInputs(items, verdicts(items), NOW);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.windowEnd).toBe(NOW.toISOString());
  });

  it('stops at 6 windows', () => {
    // Ten groups, 4h apart: every window's top 10 is a different group.
    const items = Array.from({ length: 10 }, (_, g) =>
      Array.from({ length: 10 }, (_, i) => item(`g${g}-${i}`, 4 * g + 1))).flat();
    const inputs = buildBriefingInputs(items, verdicts(items), NOW);
    expect(inputs).toHaveLength(6);
    expect(inputs.map((i) => i.windowEnd)).toEqual(
      [0, 4, 8, 12, 16, 20].map((h) => new Date(NOW.getTime() - h * HOUR).toISOString()),
    );
  });

  it('places undated items only in the `now` window', () => {
    const undated = Array.from({ length: 8 }, (_, i) => item(`u${i}`, 'undated'));
    const old = Array.from({ length: 8 }, (_, i) => item(`o${i}`, 30));
    const all = [...undated, ...old];
    const inputs = buildBriefingInputs(all, verdicts(all), NOW);

    const undatedTitles = undated.map((u) => u.title);
    expect(titles(inputs[0]!).sort()).toEqual([...undatedTitles].sort());
    expect(inputs.length).toBeGreaterThan(1);
    for (const later of inputs.slice(1)) {
      expect(titles(later).some((t) => undatedTitles.includes(t))).toBe(false);
    }
  });

  it('orders like the digest and keeps only what the summarize job would see', () => {
    const items = [
      item('A', 2, { tier: 2 }),
      item('B', 2),
      item('C', 3),
      item('D', 1),
      item('E', 1),
      item('F', 1),
      ...Array.from({ length: 6 }, (_, i) => item(`G${i}`, 1 + i, { tier: 3 })),
    ];
    const map = verdicts(items, {
      A: { importance: 0.9 },
      B: { importance: 0.6 },
      C: { importance: 0.9 },
      D: { relevant_to_city: false },
      E: { importance: 0.4 },
      F: null,
      ...Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`G${i}`, { importance: 0.7 }])),
    });
    const [input] = buildBriefingInputs(items, map, NOW);
    expect(titles(input!)).toEqual([
      'Headline C', 'Headline B', 'Headline A',
      'Headline G0', 'Headline G1', 'Headline G2', 'Headline G3', 'Headline G4', 'Headline G5',
    ]);
  });
});

// Markup as served by berlin.de on 2026-09-24.
const listItem = (date: string, href: string, title: string) =>
  `<li><div class="cell nowrap date">${date}</div><div class="cell text"><a href="${href}" >${title}</a><span class="category"><strong>Ereignisort: </strong>Lichtenberg</span></div></li><!-- /Flex Autoteaser_ListItem -->`;

describe('parseArchiveList', () => {
  it('reads url, title and a Berlin-time timestamp from each entry', () => {
    const html = `<ul class="list--tablelist">${[
      listItem('23.09.2026 14:19 Uhr', '/polizei/polizeimeldungen/2026/pressemitteilung.1717600.php', 'Distanzelektroimpulsgerät eingesetzt'),
      listItem('05.01.2026 09:05 Uhr', '/polizei/polizeimeldungen/2026/pressemitteilung.1600001.php', 'Brand &amp; Festnahme in &quot;Kiez&quot;'),
    ].join('')}</ul>`;

    expect(parseArchiveList(html)).toEqual([
      {
        url: 'https://www.berlin.de/polizei/polizeimeldungen/2026/pressemitteilung.1717600.php',
        title: 'Distanzelektroimpulsgerät eingesetzt',
        publishedAt: '2026-09-23T14:19:00+02:00',
      },
      {
        url: 'https://www.berlin.de/polizei/polizeimeldungen/2026/pressemitteilung.1600001.php',
        title: 'Brand & Festnahme in "Kiez"',
        publishedAt: '2026-01-05T09:05:00+01:00',
      },
    ]);
  });

  it('returns nothing for a page without entries', () => {
    expect(parseArchiveList('<html><body><p>Keine Treffer</p></body></html>')).toEqual([]);
  });
});

describe('parseReleaseBody', () => {
  it('returns the first textile block as plain text, the way the RSS description reads', () => {
    const html = `<h1 class="title">Titel</h1><p class="polizeimeldung">Polizeimeldung vom 16.09.2026</p>
      <div class="text">
        <div class="textile">
          <p>
            <strong>Nr. 1189</strong><br>
            Gestern Nachmittag wurden Einsatzkräfte in den Ortsteil Gropiusstadt&nbsp;alarmiert.
          </p>
          <p>Zweiter &#8222;Absatz&#8220;.</p>
        </div>
        <div class="textile"><p>Kontakt</p></div>
      </div>`;
    expect(parseReleaseBody(html)).toBe('Nr. 1189 Gestern Nachmittag wurden Einsatzkräfte in den Ortsteil Gropiusstadt alarmiert. Zweiter „Absatz“.');
  });

  it('returns an empty string when the page has no textile block', () => {
    expect(parseReleaseBody('<html><body>Fehler 404</body></html>')).toBe('');
  });
});
