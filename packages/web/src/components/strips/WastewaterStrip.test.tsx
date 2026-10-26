import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import i18n from 'i18next';
import type { WastewaterSummary } from '../../lib/api.js';
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

vi.mock('../../hooks/useCityConfig.js', () => ({
  useCityConfig: () => ({ id: 'berlin', name: 'Berlin' }),
}));

vi.mock('../../hooks/useWastewater.js', () => ({
  useWastewater: () => ({ data: SUMMARY, fetchedAt: null, isLoading: false, isError: false, refetch: vi.fn() }),
}));

/**
 * Arabic digits and marks come from ICU, so the Arabic dates are built the way
 * the other tiles build them; the Arabic month name shows the locale was used.
 */
const arLong = (iso: string) => new Date(iso).toLocaleDateString('ar', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const arShort = (iso: string) => new Date(iso).toLocaleDateString('ar', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const AR_OCTOBER = 'أكتوبر';

describe('WastewaterStrip dates follow the UI language, not the browser', () => {
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
