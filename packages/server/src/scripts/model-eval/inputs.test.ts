import { describe, it, expect } from 'vitest';
import type { NewsItem } from '@city-monitor/shared';
import { buildBriefingInputs } from './inputs.js';
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
