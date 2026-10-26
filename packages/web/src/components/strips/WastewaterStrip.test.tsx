import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import i18n from 'i18next';
import type { WastewaterPathogen, WastewaterSummary } from '../../lib/api.js';
import { WastewaterStrip } from './WastewaterStrip.js';

const SUMMARY: WastewaterSummary = {
  sampleDate: '2026-10-20',
  plantCount: 3,
  pathogens: [
    // Two weekly points: the sparkline runs from Oct 13 to Oct 20.
    { name: 'Influenza A', value: 1200, previousValue: 900, trend: 'rising', level: 'moderate', history: [900, 1200] },
    // Lagging pathogen with its own sample date: Oct 6 to Oct 13.
    { name: 'RSV', value: 500, previousValue: 600, trend: 'falling', level: 'low', history: [600, 500], sampleDate: '2026-10-13' },
  ],
};

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

/**
 * Arabic digits and marks come from ICU, so the Arabic dates are built the way
 * the other tiles build them; the Arabic month name shows the locale was used.
 */
const arLong = (iso: string) => new Date(iso).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const arShort = (iso: string) => new Date(iso).toLocaleDateString('ar', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const AR_OCTOBER = 'أكتوبر';

describe('WastewaterStrip dates follow the UI language, not the browser', () => {
  beforeEach(() => {
    summary = SUMMARY;
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', 'Sample: Oct 20, 2026', ['Oct 13', 'Oct 20', '(Oct 13)', 'Oct 6']],
    ['de', 'Probe: 20. Okt. 2026', ['13. Okt.', '20. Okt.', '(13. Okt.)', '6. Okt.']],
    ['tr', 'Örnek: 20 Eki 2026', ['13 Eki', '20 Eki', '(13 Eki)', '6 Eki']],
    ['ar', `عينة: ${arLong('2026-10-20')}`, [arShort('2026-10-13'), arShort('2026-10-20'), `(${arShort('2026-10-13')})`, arShort('2026-10-06'), AR_OCTOBER]],
  ])('expanded tile in %s', async (lang, footer, shortDates) => {
    await i18n.changeLanguage(lang);
    const { container } = render(<WastewaterStrip expanded />);
    const text = container.textContent!;
    expect(text).toContain(footer);
    for (const d of shortDates) expect(text).toContain(d);
  });

  it('collapsed tile footer in German', async () => {
    await i18n.changeLanguage('de');
    const { container } = render(<WastewaterStrip expanded={false} />);
    expect(container.textContent).toContain('Probe: 20. Okt. 2026');
  });
});

describe('WastewaterStrip readings', () => {
  beforeEach(() => {
    const reading = (name: string, value: number): WastewaterPathogen => (
      { name, value, previousValue: value, trend: 'stable', level: 'low', history: [value, value] }
    );
    summary = {
      sampleDate: '2026-10-20',
      plantCount: 3,
      pathogens: [reading('Influenza A', 1_500_000), reading('Influenza B', 1_200), reading('RSV', 500.4), reading('SARS-CoV-2', 0)],
    };
  });

  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage('en');
  });

  // Shortened with one decimal and a point in every language, then the unit.
  it.each(['en', 'de', 'tr', 'ar'])('expanded tile in %s', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<WastewaterStrip expanded />);
    for (const text of ['1.5M gc/L', '1.2k gc/L', '500 gc/L', '0 gc/L']) {
      expect(screen.getByText(text)).toBeTruthy();
    }
  });
});

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
