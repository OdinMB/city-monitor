import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import type { ApiResponse, NewsDigest, NewsItem } from '@city-monitor/shared';
import { CityProvider } from '../../hooks/CityProvider.js';
import { NewsStrip } from './NewsStrip.js';
import { AI_COPY_LANGS, APPROVED_AI_COPY } from '../../test-fixtures/approved-ai-copy.js';

const ITEM: NewsItem = {
  id: 'n1',
  title: 'Tram line M10 suspended',
  url: 'https://www.rbb24.de/a/1',
  publishedAt: '2026-03-17T10:00:00Z',
  sourceName: 'rbb24',
  sourceUrl: 'https://www.rbb24.de/',
  category: 'transit',
  tier: 1,
  lang: 'de',
  location: { lat: 52.5, lon: 13.45, label: 'Warschauer Straße' },
  importance: 0.87,
};

function createWrapper(items: NewsItem[]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const digest: ApiResponse<NewsDigest> = {
    data: { items, categories: {}, updatedAt: '2026-03-17T10:00:00Z' },
    fetchedAt: '2026-03-17T10:05:00Z',
  };
  queryClient.setQueryData(['news', 'digest', 'berlin'], digest);

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('NewsStrip AI disclosures', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each(AI_COPY_LANGS)('shows the approved legend as visible text (%s)', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<NewsStrip />, { wrapper: createWrapper([ITEM]) });
    expect(screen.getByRole('note').textContent).toBe(APPROVED_AI_COPY[lang].newsLegend);
  });

  it.each(AI_COPY_LANGS)('names the importance score as AI-rated, keeping its value (%s)', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<NewsStrip />, { wrapper: createWrapper([ITEM]) });
    const score = screen.getByRole('meter', { name: APPROVED_AI_COPY[lang].importanceScore });
    expect(score.getAttribute('title')).toBe(APPROVED_AI_COPY[lang].importanceScore);
    expect(score.textContent).toBe('87%');
    expect(score.getAttribute('aria-valuenow')).toBe('87');
    expect(score.getAttribute('aria-valuetext')).toBe('87%');
  });

  it.each(AI_COPY_LANGS)('names the location pin as estimated by AI (%s)', async (lang) => {
    await i18n.changeLanguage(lang);
    render(<NewsStrip />, { wrapper: createWrapper([ITEM]) });
    const pin = screen.getByRole('img', { name: APPROVED_AI_COPY[lang].locationEstimated });
    expect(pin.getAttribute('title')).toBe(APPROVED_AI_COPY[lang].locationEstimated);
  });

  it('shows no pin note for an item without a location', () => {
    render(<NewsStrip />, { wrapper: createWrapper([{ ...ITEM, location: undefined }]) });
    expect(screen.queryByRole('img', { name: APPROVED_AI_COPY.en.locationEstimated })).toBeNull();
  });
});
