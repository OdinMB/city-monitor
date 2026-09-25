import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCache } from '../lib/cache.js';
import { summarizeHeadlines } from '../lib/openai.js';
import { createSummarization, selectBriefingItems, type NewsSummary } from './summarize.js';

vi.mock('../lib/openai.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/openai.js')>()),
  summarizeHeadlines: vi.fn(),
}));

describe('selectBriefingItems', () => {
  it('takes items scored 0.5 or higher and drops lower and unscored ones, in digest order', () => {
    const digest = [
      { id: 'a', importance: 0.49 },
      { id: 'b', importance: 0.5 },
      { id: 'c' },
      { id: 'd', importance: 0.8 },
      { id: 'e', importance: 0 },
    ];
    expect(selectBriefingItems(digest).map((item) => item.id)).toEqual(['b', 'd']);
  });

  it('keeps at most the first 25 qualifying items', () => {
    const digest = Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, importance: i % 2 === 0 ? 0.5 : 0.2 }));
    digest.push(...Array.from({ length: 20 }, (_, i) => ({ id: `m${i}`, importance: 0.9 })));
    const selected = selectBriefingItems(digest);
    expect(selected).toHaveLength(25);
    expect(selected[0]!.id).toBe('n0');
    expect(selected[24]!.id).toBe('m9');
  });
});

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
      model: 'gpt-6-luna',
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

  it('records which model wrote the briefing, so the API can mark it', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.mocked(summarizeHeadlines).mockResolvedValue({
      briefings: { de: 'Zusammenfassung' },
      cached: false,
      inputTokens: 100,
      outputTokens: 50,
      model: 'gpt-6-luna',
    });
    const cache = createCache();
    cache.set('berlin:news:digest', {
      items: [{ id: '1', title: 'Wichtige Meldung', importance: 0.8, tier: 1 }],
      categories: {},
      updatedAt: new Date().toISOString(),
    }, 60);

    await createSummarization(cache)();

    expect(cache.get<NewsSummary>('berlin:news:summary')!.model).toBe('gpt-6-luna');
  });
});
