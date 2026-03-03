/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { parseHistoryDays } from './parse-history.js';

describe('parseHistoryDays', () => {
  it('parses valid day strings', () => {
    expect(parseHistoryDays('7d', 30)).toBe(7);
    expect(parseHistoryDays('30d', 30)).toBe(30);
    expect(parseHistoryDays('1d', 365)).toBe(1);
  });

  it('returns null for missing/undefined input', () => {
    expect(parseHistoryDays(undefined, 30)).toBeNull();
    expect(parseHistoryDays(null, 30)).toBeNull();
  });

  it('returns null for invalid formats', () => {
    expect(parseHistoryDays('7', 30)).toBeNull();
    expect(parseHistoryDays('d7', 30)).toBeNull();
    expect(parseHistoryDays('7days', 30)).toBeNull();
    expect(parseHistoryDays('', 30)).toBeNull();
  });

  it('returns null when exceeding maxDays', () => {
    expect(parseHistoryDays('31d', 30)).toBeNull();
    expect(parseHistoryDays('100d', 30)).toBeNull();
  });

  it('returns null for 0 days', () => {
    expect(parseHistoryDays('0d', 30)).toBeNull();
  });
});
