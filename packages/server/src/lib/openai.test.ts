/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { summarizeHeadlines, getUsageStats, isConfigured } from './openai.js';

describe('openai', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('isConfigured returns false when OPENAI_API_KEY is not set', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(isConfigured()).toBe(false);
  });

  it('summarizeHeadlines returns null when not configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const result = await summarizeHeadlines('Berlin', ['Headline 1', 'Headline 2'], 'de');
    expect(result).toBeNull();
  });

  it('getUsageStats returns empty object initially', () => {
    const stats = getUsageStats();
    expect(stats).toEqual({});
  });
});
