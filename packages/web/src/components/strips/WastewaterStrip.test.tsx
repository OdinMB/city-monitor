import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { WastewaterPathogen, WastewaterSummary } from '../../lib/api.js';
import { WastewaterStrip } from './WastewaterStrip.js';

function pathogen(name: string, level: WastewaterPathogen['level'], trend: WastewaterPathogen['trend']): WastewaterPathogen {
  return { name, value: 30_000, previousValue: 20_000, trend, level, history: [10_000, 20_000, 30_000] };
}

// Long level words: wider than a phone-width tile on one line.
const ALL: WastewaterPathogen[] = [
  pathogen('Influenza A', 'moderate', 'rising'),
  pathogen('Influenza B', 'moderate', 'falling'),
  pathogen('RSV', 'moderate', 'stable'),
  { ...pathogen('SARS-CoV-2', 'moderate', 'rising'), sampleDate: '2026-10-17' },
  pathogen('Mpox', 'moderate', 'rising'),
];
const LABELS = ['Flu A', 'Flu B', 'RSV', 'COVID-19', 'Mpox'];

let summary: WastewaterSummary;

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useWastewater.js', () => ({
  useWastewater: () => ({ data: summary, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

function withPathogens(count: number) {
  summary = { sampleDate: '2026-10-22', plantCount: 3, pathogens: ALL.slice(0, count) };
}

/** Innermost element that holds all of the given texts. */
function commonContainer(texts: string[]): HTMLElement {
  let el: HTMLElement | null = screen.getByText(texts[0]!);
  while (el && !texts.every((text) => el!.textContent?.includes(text))) el = el.parentElement;
  if (!el) throw new Error(`no element contains all of ${texts.join(', ')}`);
  return el;
}

describe('WastewaterStrip collapsed layout', () => {
  beforeEach(() => withPathogens(4));

  it.each([
    [3, [['Flu A', 'Flu B'], ['RSV']]],
    [4, [['Flu A', 'Flu B'], ['RSV', 'COVID-19']]],
    [5, [['Flu A', 'Flu B'], ['RSV', 'COVID-19'], ['Mpox']]],
  ])('wraps %i pathogens as pairs, so a row that does not fit becomes 2x2 (or 2 + 1)', (count, expected) => {
    withPathogens(count);
    render(<WastewaterStrip expanded={false} />);
    const row = commonContainer(LABELS.slice(0, count));
    expect(row.classList.contains('flex-wrap')).toBe(true);

    const pairs = [...row.children] as HTMLElement[];
    expect(pairs.map((pair) => [...pair.children].map((cell) => cell.firstElementChild?.textContent))).toEqual(expected);
    for (const pair of pairs) {
      // Wrap on the rendered width; share the line in proportion to the pathogen count.
      expect(pair.classList.contains('flex-wrap')).toBe(true);
      expect(pair.classList.contains('min-w-fit')).toBe(true);
      expect(pair.classList.contains('basis-0')).toBe(true);
      expect(pair.classList.contains(pair.children.length === 2 ? 'grow-2' : 'grow')).toBe(true);
      for (const cell of pair.children) {
        expect(cell.classList.contains('flex-1')).toBe(true);
        expect(cell.classList.contains('min-w-fit')).toBe(true);
      }
    }
  });

  it('still shows every pathogen with its level and trend arrow', () => {
    render(<WastewaterStrip expanded={false} />);
    for (const label of ['Flu A', 'Flu B', 'RSV', 'COVID-19']) {
      expect(screen.getAllByText(label)).toHaveLength(1);
    }
    expect(screen.getAllByText('Moderate')).toHaveLength(4);
    expect(screen.getAllByText('↑')).toHaveLength(2);
    expect(screen.getAllByText('↓')).toHaveLength(1);
    expect(screen.getAllByText('→')).toHaveLength(1);
  });
});
