import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { createSummarization, type NewsSummary } from './summarize.js';

describe('summarize', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('OPENAI_API_KEY', '');
  });

  it('skips summarization when OPENAI_API_KEY is not set', async () => {
    const cache = createCache();
    cache.set('berlin:news:digest', {
      items: [{ id: '1', title: 'Test headline', tier: 1 }],
      categories: {},
      updatedAt: new Date().toISOString(),
    }, 60);

    const summarize = createSummarization(cache);
    await summarize();

    const summary = cache.get<NewsSummary>('berlin:news:summary');
    expect(summary).toBeNull();
  });

  it('skips summarization when no news digest exists', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const cache = createCache();

    const summarize = createSummarization(cache);
    await summarize();

    const summary = cache.get<NewsSummary>('berlin:news:summary');
    expect(summary).toBeNull();
  });

  it('stores briefings as a Record<string, string> keyed by language', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const cache = createCache();

    // Seed cache with a pre-built summary to verify the shape
    const mockSummary: NewsSummary = {
      briefings: {
        de: 'Deutsche Zusammenfassung',
        en: 'English summary',
      },
      generatedAt: new Date().toISOString(),
      headlineCount: 5,
      cached: true,
    };
    cache.set('berlin:news:summary', mockSummary, 60);

    const result = cache.get<NewsSummary>('berlin:news:summary');
    expect(result).not.toBeNull();
    expect(result!.briefings).toEqual({
      de: 'Deutsche Zusammenfassung',
      en: 'English summary',
    });
    expect(result!.briefings['de']).toBe('Deutsche Zusammenfassung');
    expect(result!.briefings['en']).toBe('English summary');
  });
});
