import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveSiteTarget, getModel, estimateCostUsd, describeTarget, DEFAULT_PRICING, MODEL_PRICING } from './llm-client.js';

const SITE_ENV = [
  'OPENAI_MODEL',
  'OPENAI_FILTER_MODEL',
  'OPENAI_GEO_MODEL',
  'OPENAI_SUMMARY_EFFORT',
  'OPENAI_FILTER_EFFORT',
  'OPENAI_GEO_EFFORT',
];

beforeEach(() => {
  for (const name of SITE_ENV) vi.stubEnv(name, '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('resolveSiteTarget — models', () => {
  it('keeps today\'s models and sends no effort when nothing is configured', () => {
    expect(resolveSiteTarget('summary')).toEqual({ model: 'gpt-5-mini' });
    expect(resolveSiteTarget('filter')).toEqual({ model: 'gpt-5-nano' });
    expect(resolveSiteTarget('geo')).toEqual({ model: 'gpt-5-nano' });
  });

  it('uses OPENAI_FILTER_MODEL for police extraction when OPENAI_GEO_MODEL is unset', () => {
    vi.stubEnv('OPENAI_FILTER_MODEL', 'gpt-6-luna');
    expect(resolveSiteTarget('geo').model).toBe('gpt-6-luna');
  });

  it('prefers OPENAI_GEO_MODEL for police extraction when it is set', () => {
    vi.stubEnv('OPENAI_FILTER_MODEL', 'gpt-6-luna');
    vi.stubEnv('OPENAI_GEO_MODEL', 'gpt-5.6-luna');
    expect(resolveSiteTarget('geo').model).toBe('gpt-5.6-luna');
    expect(resolveSiteTarget('filter').model).toBe('gpt-6-luna');
  });
});

describe('resolveSiteTarget — effort validation', () => {
  function effortFor(model: string, effort: string): string | undefined {
    vi.stubEnv('OPENAI_FILTER_MODEL', model);
    vi.stubEnv('OPENAI_FILTER_EFFORT', effort);
    return resolveSiteTarget('filter').effort;
  }

  it('passes a valid effort through', () => {
    expect(effortFor('gpt-6-luna', 'low')).toBe('low');
    expect(effortFor('gpt-5-nano', 'minimal')).toBe('minimal');
  });

  it('normalises case and whitespace', () => {
    expect(effortFor('gpt-6-sol', ' Medium ')).toBe('medium');
  });

  it('ignores an empty or unknown effort', () => {
    expect(effortFor('gpt-6-luna', '')).toBeUndefined();
    expect(effortFor('gpt-6-luna', 'turbo')).toBeUndefined();
  });

  it('ignores minimal on GPT-6, which rejects it', () => {
    expect(effortFor('gpt-6-luna', 'minimal')).toBeUndefined();
  });

  it('ignores none and xhigh on the gpt-5 family, which has neither', () => {
    expect(effortFor('gpt-5-nano', 'none')).toBeUndefined();
    expect(effortFor('gpt-5-nano', 'xhigh')).toBeUndefined();
    expect(effortFor('gpt-5-mini-2025-08-07', 'max')).toBeUndefined();
  });

  it('accepts none on GPT-6 and on gpt-5.6-luna', () => {
    expect(effortFor('gpt-6-luna', 'none')).toBe('none');
    expect(effortFor('gpt-5.6-luna', 'none')).toBe('none');
  });

  it('reads each site\'s effort from its own variable', () => {
    vi.stubEnv('OPENAI_MODEL', 'gpt-6-sol');
    vi.stubEnv('OPENAI_SUMMARY_EFFORT', 'high');
    vi.stubEnv('OPENAI_GEO_MODEL', 'gpt-6-luna');
    vi.stubEnv('OPENAI_GEO_EFFORT', 'none');
    expect(resolveSiteTarget('summary')).toEqual({ model: 'gpt-6-sol', effort: 'high' });
    expect(resolveSiteTarget('geo')).toEqual({ model: 'gpt-6-luna', effort: 'none' });
    expect(resolveSiteTarget('filter')).toEqual({ model: 'gpt-5-nano' });
  });
});

describe('getModel — request parameters', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
  });

  it('sends reasoning_effort for gpt-6 IDs and no token limit or sampling parameters', () => {
    const params: Record<string, unknown> = { ...getModel('gpt-6-luna', 'low').invocationParams() };
    expect(params.reasoning_effort).toBe('low');
    expect(params.max_tokens).toBeUndefined();
    expect(params.max_completion_tokens).toBeUndefined();
    expect(params.temperature).toBeUndefined();
    expect(params.top_p).toBeUndefined();
  });

  it('sends reasoning_effort for gpt-5 IDs too', () => {
    const params: Record<string, unknown> = { ...getModel('gpt-5.6-luna', 'none').invocationParams() };
    expect(params.reasoning_effort).toBe('none');
  });

  it('leaves the request unchanged from today when no effort is given', () => {
    const params: Record<string, unknown> = { ...getModel('gpt-5-nano').invocationParams() };
    expect(params.model).toBe('gpt-5-nano');
    expect('reasoning_effort' in params).toBe(false);
  });
});

describe('estimateCostUsd', () => {
  it('prices known models from the table', () => {
    const p = MODEL_PRICING['gpt-6-luna']!;
    expect(estimateCostUsd('gpt-6-luna', 1_000_000, 2_000_000)).toBeCloseTo(p.input + 2 * p.output);
  });

  it('falls back to the default price for unknown models', () => {
    expect(estimateCostUsd('some-new-model', 1_000_000, 1_000_000))
      .toBeCloseTo(DEFAULT_PRICING.input + DEFAULT_PRICING.output);
  });
});

describe('describeTarget', () => {
  it('names the effort, or default when none is sent', () => {
    expect(describeTarget({ model: 'gpt-6-luna', effort: 'low' })).toBe('gpt-6-luna@low');
    expect(describeTarget({ model: 'gpt-5-nano' })).toBe('gpt-5-nano@default');
  });
});
