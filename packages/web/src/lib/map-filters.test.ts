/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { filterSafetyByRecency } from './map-filters.js';
import type { SafetyReport } from './api.js';

function makeSafetyReport(overrides: Partial<SafetyReport> = {}): SafetyReport {
  return {
    id: '1',
    title: 'Test report',
    description: 'Test',
    publishedAt: new Date().toISOString(),
    url: 'https://example.com',
    ...overrides,
  };
}

describe('filterSafetyByRecency', () => {
  const now = new Date('2026-03-03T12:00:00Z').getTime();

  it('returns all reports at close zoom (>= threshold)', () => {
    const old = makeSafetyReport({ id: '1', publishedAt: '2026-02-25T12:00:00Z' }); // 6 days old
    const recent = makeSafetyReport({ id: '2', publishedAt: '2026-03-03T10:00:00Z' }); // 2 hours old
    const result = filterSafetyByRecency([old, recent], 13, now);
    expect(result).toHaveLength(2);
  });

  it('returns all reports exactly at threshold zoom', () => {
    const old = makeSafetyReport({ id: '1', publishedAt: '2026-02-25T12:00:00Z' });
    const result = filterSafetyByRecency([old], 12, now);
    expect(result).toHaveLength(1);
  });

  it('filters to recent reports at city-wide zoom (< threshold)', () => {
    const old = makeSafetyReport({ id: '1', publishedAt: '2026-03-01T12:00:00Z' }); // 2 days old
    const recent = makeSafetyReport({ id: '2', publishedAt: '2026-03-03T10:00:00Z' }); // 2 hours old
    const result = filterSafetyByRecency([old, recent], 10, now);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('returns empty array when no reports are recent enough at low zoom', () => {
    const old1 = makeSafetyReport({ id: '1', publishedAt: '2026-02-28T12:00:00Z' });
    const old2 = makeSafetyReport({ id: '2', publishedAt: '2026-03-01T12:00:00Z' });
    const result = filterSafetyByRecency([old1, old2], 10, now);
    expect(result).toHaveLength(0);
  });

  it('handles reports exactly at the 24h boundary', () => {
    const exactly24h = makeSafetyReport({
      id: '1',
      publishedAt: '2026-03-02T12:00:00Z', // exactly 24h before now
    });
    const result = filterSafetyByRecency([exactly24h], 10, now);
    expect(result).toHaveLength(1); // exactly at cutoff should be included (>=)
  });

  it('excludes reports with invalid publishedAt', () => {
    const invalid = makeSafetyReport({ id: '1', publishedAt: 'not-a-date' });
    const result = filterSafetyByRecency([invalid], 10, now);
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty input', () => {
    expect(filterSafetyByRecency([], 10, now)).toHaveLength(0);
    expect(filterSafetyByRecency([], 14, now)).toHaveLength(0);
  });
});
