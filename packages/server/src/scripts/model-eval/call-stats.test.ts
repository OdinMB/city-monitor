import { describe, it, expect } from 'vitest';
import { classifyFailure, callStats } from './call-stats.js';
import type { CallRecord } from './arms.js';

describe('classifyFailure', () => {
  it('treats empty content as a refusal', () => {
    expect(classifyFailure({ content: '', finishReason: 'stop' })).toBe('refusal');
    expect(classifyFailure({ content: [], finishReason: 'stop' })).toBe('refusal');
  });

  it('treats finish_reason length as truncated, even with empty content', () => {
    expect(classifyFailure({ content: '{"items": [', finishReason: 'length' })).toBe('truncated');
    expect(classifyFailure({ content: '', finishReason: 'length' })).toBe('truncated');
  });

  it('treats other malformed content as a parse failure', () => {
    expect(classifyFailure({ content: 'not json', finishReason: 'stop' })).toBe('parse');
  });
});

describe('callStats', () => {
  const base: CallRecord = {
    site: 'news', arm: 'a', requestId: 'r', inputIds: [], ms: 0, inTok: 0, outTok: 0,
    reasoningTok: 0, costUsd: 0, finishReason: 'stop',
  };

  it('uses nearest-rank percentiles and leaves API errors out of latency and cost per call', () => {
    const records: CallRecord[] = [
      ...[100, 200, 300, 400].map((ms) => ({ ...base, ms, costUsd: 0.01 })),
      { ...base, ms: 9999, error: 'api' },
    ];
    const stats = callStats(records);
    expect(stats.p50Ms).toBe(200);
    expect(stats.p95Ms).toBe(400);
    expect(stats.apiErrors).toBe(1);
    expect(stats.costPerCall).toBeCloseTo(0.01);
  });
});
