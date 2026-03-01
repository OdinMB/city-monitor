/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

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
});
