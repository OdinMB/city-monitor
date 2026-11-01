import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/CityProvider.js';
import { CityContext } from '../../hooks/CityContext.js';
import { hamburg } from '../../config/cities/hamburg.js';
import { BriefingStrip } from './BriefingStrip.js';
import { AI_COPY_LANGS, APPROVED_AI_COPY } from '../../test-fixtures/approved-ai-copy.js';
import type { NewsSummaryData, ApiResponse } from '@city-monitor/shared';

function createWrapper(options?: { summary?: ApiResponse<NewsSummaryData>; lang?: string }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  if (options?.summary) {
    queryClient.setQueryData(['news', 'summary', 'berlin', options.lang ?? 'en'], options.summary);
  }

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CityProvider cityId="berlin">{children}</CityProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('BriefingStrip', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock fetch to never resolve (prevents real network calls, simulates loading)
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  });

  it('renders skeleton when loading', () => {
    render(<BriefingStrip />, { wrapper: createWrapper() });
    expect(screen.getByTestId('skeleton')).toBeTruthy();
  });

  it('renders briefing text with paragraph splitting', () => {
    const summary: ApiResponse<NewsSummaryData> = {
      data: {
        briefing: 'First paragraph about transit.\n\nSecond paragraph about weather.',
        generatedAt: '2026-03-17T10:00:00Z',
        headlineCount: 12,
        cached: false,
        aiGenerated: true,
        generator: 'gpt-6-luna',
      },
      fetchedAt: '2026-03-17T10:05:00Z',
    };

    render(<BriefingStrip />, { wrapper: createWrapper({ summary }) });
    expect(screen.getByText('First paragraph about transit.')).toBeTruthy();
    expect(screen.getByText('Second paragraph about weather.')).toBeTruthy();
  });

  it('marks the element holding the briefing text as AI-generated for machines', () => {
    const summary: ApiResponse<NewsSummaryData> = {
      data: {
        briefing: 'Only paragraph.',
        generatedAt: '2026-03-17T10:00:00Z',
        headlineCount: 3,
        cached: false,
        aiGenerated: true,
        generator: 'gpt-6-luna',
      },
      fetchedAt: '2026-03-17T10:05:00Z',
    };

    render(<BriefingStrip />, { wrapper: createWrapper({ summary }) });
    expect(screen.getByText('Only paragraph.').closest('[data-ai-generated="true"]')).not.toBeNull();
  });

  describe('AI notice', () => {
    afterEach(async () => {
      await i18n.changeLanguage('en');
    });

    // The caveat moved into the tooltip of the heading's AiLabel tag (2026-09-26),
    // so the tile opens straight with the marked briefing text.
    it.each(AI_COPY_LANGS)('has no notice line above the briefing text (%s)', async (lang) => {
      await i18n.changeLanguage(lang);
      const summary: ApiResponse<NewsSummaryData> = {
        data: {
          briefing: 'First paragraph.\n\nSecond paragraph.',
          generatedAt: '2026-03-17T10:00:00Z',
          headlineCount: 5,
          cached: false,
          aiGenerated: true,
          generator: 'gpt-6-luna',
        },
        fetchedAt: '2026-03-17T10:05:00Z',
      };

      const { container } = render(<BriefingStrip />, { wrapper: createWrapper({ summary, lang }) });
      expect(screen.queryByRole('note')).toBeNull();
      expect(screen.queryByText(APPROVED_AI_COPY[lang].tooltip)).toBeNull();
      expect(container.firstElementChild?.getAttribute('data-ai-generated')).toBe('true');
      expect(screen.getByText('First paragraph.').closest('[data-ai-generated="true"]')).toBe(container.firstElementChild);
    });
  });

  describe('footer', () => {
    afterEach(async () => {
      await i18n.changeLanguage('en');
    });

    // The relative time already carries its "ago" word, so the sentence around
    // it must not add another one (e.g. "7 dk önce önce oluşturuldu").
    it.each([
      ['en', 'Generated 7 min ago · Updated just now'],
      ['de', 'Erstellt vor 7 Min. · Aktualisiert gerade eben'],
      ['tr', '7 dk önce oluşturuldu · Güncellendi az önce'],
      ['ar', 'تم الإنشاء منذ 7 دقائق · تم التحديث الآن'],
    ])('shows when the briefing was generated without a doubled "ago" (%s)', async (lang, expected) => {
      await i18n.changeLanguage(lang);
      const now = Date.now();
      const summary: ApiResponse<NewsSummaryData> = {
        data: {
          briefing: 'Only paragraph.',
          generatedAt: new Date(now - 7 * 60_000).toISOString(),
          headlineCount: 3,
          cached: false,
          aiGenerated: true,
          generator: 'gpt-6-luna',
        },
        fetchedAt: new Date(now).toISOString(),
      };

      render(<BriefingStrip />, { wrapper: createWrapper({ summary, lang }) });
      expect(screen.getByText(expected)).toBeTruthy();
    });
  });

  it('renders empty message when briefing is null', () => {
    const summary: ApiResponse<NewsSummaryData> = {
      data: {
        briefing: null,
        generatedAt: null,
        headlineCount: 0,
        cached: false,
        aiGenerated: false,
        generator: null,
      },
      fetchedAt: '2026-03-17T10:05:00Z',
    };

    const { container } = render(<BriefingStrip />, { wrapper: createWrapper({ summary }) });
    expect(screen.getByText('No articles available')).toBeTruthy();
    expect(container.querySelector('[data-ai-generated]')).toBeNull();
  });

  it('renders error fallback on fetch error', async () => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const Wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CityProvider cityId="berlin">{children}</CityProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    render(<BriefingStrip />, { wrapper: Wrapper });

    // Wait for the error state to appear (longer timeout — useNewsSummary has retry: 1)
    const errorText = await screen.findByText(/Failed to load Briefing/, {}, { timeout: 5000 });
    expect(errorText).toBeTruthy();
  });
});

describe('BriefingStrip in a language the city does not write its briefing in', () => {
  const summary: ApiResponse<NewsSummaryData> = {
    data: {
      briefing: 'Deutscher Absatz über das Wetter.',
      generatedAt: '2026-03-17T10:00:00Z',
      headlineCount: 12,
      cached: false,
      aiGenerated: true,
      generator: 'gpt-6-luna',
    },
    fetchedAt: '2026-03-17T10:05:00Z',
  };

  function renderHamburg() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // Hamburg writes German and English: Turkish and Arabic pages get the German briefing.
    queryClient.setQueryData(['news', 'summary', 'hamburg', 'de'], summary);
    return render(
      <QueryClientProvider client={queryClient}>
        <CityContext.Provider value={hamburg}>
          <BriefingStrip />
        </CityContext.Provider>
      </QueryClientProvider>,
    );
  }

  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await i18n.changeLanguage('en');
  });

  it.each(['tr', 'ar'])('shows the city\'s first language, marked as such, on a %s page', async (lang) => {
    await i18n.changeLanguage(lang);
    const { container } = renderHamburg();

    const text = container.querySelector('[data-ai-generated]')!;
    expect(text.textContent).toContain('Deutscher Absatz');
    expect(text.getAttribute('lang')).toBe('de');
    expect(text.getAttribute('dir')).toBe('ltr');
    expect(screen.getByText(i18n.t('panel.news.briefingOnlyIn', {
      language: new Intl.DisplayNames([lang], { type: 'language' }).of('de'),
    }))).toBeTruthy();
  });

  it('marks nothing when the briefing is in the page\'s language', async () => {
    await i18n.changeLanguage('de');
    const { container } = renderHamburg();

    expect(container.querySelector('[data-ai-generated]')!.hasAttribute('lang')).toBe(false);
    expect(container.querySelector('p.text-xs')).toBeNull();
  });
});
