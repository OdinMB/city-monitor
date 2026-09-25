import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import i18n from 'i18next';
import type { ReactNode } from 'react';
import { CityProvider } from '../../hooks/CityProvider.js';
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

    it.each(AI_COPY_LANGS)('opens the briefing with the approved notice, outside the AI text (%s)', async (lang) => {
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

      render(<BriefingStrip />, { wrapper: createWrapper({ summary, lang }) });
      const notice = screen.getByRole('note');
      expect(notice.textContent).toBe(APPROVED_AI_COPY[lang].briefingNotice);
      // First line: it comes before the first paragraph of the briefing.
      const firstParagraph = screen.getByText('First paragraph.');
      expect(notice.compareDocumentPosition(firstParagraph) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      // The notice is ours, not model output, so it sits outside the machine-readable AI marker.
      expect(notice.closest('[data-ai-generated]')).toBeNull();
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
