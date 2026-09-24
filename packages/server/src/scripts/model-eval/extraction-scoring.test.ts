import { describe, it, expect } from 'vitest';
import {
  isJunkLabel,
  collectVerdicts,
  scoreExtraction,
  decideExtraction,
  type ExtractionItem,
  type ExtractionResponse,
  type ExtractionMetrics,
} from './extraction-scoring.js';
import type { CallRecord } from './arms.js';

const BBOX = { north: 52.68, south: 52.34, east: 13.76, west: 13.09 };

function record(
  inputIds: string[],
  items: ExtractionItem[] | null,
  extra: Partial<CallRecord<ExtractionResponse>> = {},
): CallRecord<ExtractionResponse> {
  return {
    site: 'news',
    arm: 'test@default',
    requestId: 'r',
    inputIds,
    ms: 100,
    inTok: 10,
    outTok: 20,
    reasoningTok: 0,
    costUsd: 0.001,
    finishReason: 'stop',
    ...(items ? { parsed: { items } } : { error: 'parse' as const }),
    ...extra,
  };
}

function newsItem(index: number, over: Partial<ExtractionItem> = {}): ExtractionItem {
  return { index, relevant_to_city: true, category: 'local', importance: 0.6, locationLabel: null, ...over };
}

describe('isJunkLabel', () => {
  it('flags control characters, replacement characters, non-Latin letters and overlong labels', () => {
    expect(isJunkLabel('Mitte\u0007')).toBe(true);
    expect(isJunkLabel(`Mitte${String.fromCodePoint(0xfffd)}`)).toBe(true);
    expect(isJunkLabel('Москва')).toBe(true);
    expect(isJunkLabel('a'.repeat(81))).toBe(true);
    expect(isJunkLabel('<|endoftext|>')).toBe(true);
    expect(isJunkLabel('Mitte\\u00fc')).toBe(true);
  });

  it('accepts umlauts, ß and hyphenated street names', () => {
    expect(isJunkLabel('Müllerstraße, Wedding')).toBe(false);
    expect(isJunkLabel('Karl-Marx-Allee')).toBe(false);
    expect(isJunkLabel('Straße des 17. Juni')).toBe(false);
    expect(isJunkLabel('a'.repeat(80))).toBe(false);
  });
});

describe('collectVerdicts', () => {
  it('counts missing and duplicate indices in accepted responses', () => {
    const { verdicts, coverage } = collectVerdicts(
      [record(['a', 'b', 'c'], [newsItem(0), newsItem(0), newsItem(2)])],
      3,
    );
    expect([...verdicts.keys()]).toEqual(['a', 'c']);
    expect(coverage).toEqual({ rejected: 0, missing: 1, omitted: 1, duplicates: 1, outOfRange: 0 });
  });

  it('counts a 1-based batch as rejected and all of its items as missing', () => {
    const { verdicts, coverage } = collectVerdicts(
      [
        record(['a', 'b'], [newsItem(0), newsItem(1)]),
        record(['c', 'd'], [newsItem(1), newsItem(2)]),
      ],
      4,
    );
    expect([...verdicts.keys()]).toEqual(['a', 'b']);
    expect(coverage).toEqual({ rejected: 1, missing: 2, omitted: 0, duplicates: 0, outOfRange: 1 });
  });

  it('counts the items of failed calls as missing but not as omitted', () => {
    const { coverage } = collectVerdicts([record(['a', 'b'], null)], 2);
    expect(coverage.missing).toBe(2);
    expect(coverage.omitted).toBe(0);
  });
});

describe('scoreExtraction', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const ctx = { n: 4, cityName: 'Berlin', bbox: BBOX, geo: new Map(), volume: 100 };

  it('counts relevance agreement and importance flips across 0.5 against the baseline', () => {
    const baseline = scoreExtraction('news', 'base', [record(ids, [
      newsItem(0, { importance: 0.6 }),
      newsItem(1, { importance: 0.4 }),
      newsItem(2, { importance: 0.7 }),
      newsItem(3, { importance: 0.2, relevant_to_city: false }),
    ])], ctx);
    const candidate = scoreExtraction('news', 'cand', [record(ids, [
      newsItem(0, { importance: 0.4 }),
      newsItem(1, { importance: 0.4 }),
      newsItem(2, { importance: 0.8 }),
      newsItem(3, { importance: 0.51 }),
    ])], ctx, baseline.verdicts);

    expect(candidate.metrics.relevanceAgreement).toBe(0.75);
    expect(candidate.metrics.importanceFlips).toBe(0.5);
    expect(candidate.metrics.categoryAgreement).toBe(1);
    // Relevant and above the briefing's > 0.5 cut-off, over all sample items.
    expect(baseline.metrics.briefingEligibleRate).toBe(0.5);
    expect(candidate.metrics.briefingEligibleRate).toBe(0.5);
  });

  it('leaves agreement undefined when there is nothing to compare', () => {
    const baseline = scoreExtraction('news', 'base', [record(ids, null)], ctx);
    const candidate = scoreExtraction('news', 'cand', [record(ids, [newsItem(0)])], ctx, baseline.verdicts);
    expect(candidate.metrics.relevanceAgreement).toBeUndefined();
  });

  it('counts invalid categories and importances before normalising', () => {
    const scored = scoreExtraction('news', 'cand', [record(ids, [
      newsItem(0, { category: 'gossip' }),
      newsItem(1, { importance: 1.4 }),
      newsItem(2),
      newsItem(3),
    ])], ctx);
    expect(scored.metrics.invalidValues).toBe(2);
  });

  it('rates labels, geocodes and on-map results over all sample items', () => {
    const geo = new Map([
      ['Mitte', { lat: 52.52, lon: 13.40 }],
      ['Potsdam', { lat: 52.39, lon: 13.06 }],
      ['Nowhere', null],
    ]);
    const scored = scoreExtraction('police', 'cand', [record(ids, [
      { index: 0, locationLabel: 'Mitte' },
      { index: 1, locationLabel: 'Potsdam' },
      { index: 2, locationLabel: 'Nowhere' },
      { index: 3, locationLabel: 'Berlin' },
    ])], { ...ctx, geo });
    expect(scored.metrics.labelRate).toBe(0.75);
    expect(scored.metrics.geocodedRate).toBe(0.5);
    expect(scored.metrics.onMapRate).toBe(0.25);
  });
});

function metrics(over: Partial<ExtractionMetrics> = {}): ExtractionMetrics {
  return {
    arm: 'arm', site: 'news', n: 1000, calls: 100,
    apiErrors: 0, refusals: 0, truncated: 0, parseErrors: 0,
    rejected: 0, missing: 0, omitted: 0, duplicates: 0, outOfRange: 0,
    invalidValues: 0, junkLabels: 0, junkExamples: [],
    labelRate: 0.8, geocodedRate: 0.6, onMapRate: 0.5,
    relevanceAgreement: 0.95, categoryAgreement: 0.9, importanceFlips: 0.05, sameLabelRate: 0.7,
    p50Ms: 1000, p95Ms: 2000, meanInTok: 1000, meanOutTok: 1000, meanReasoningTok: 500,
    costPerCall: 0.001, costPerMonth: 3.75, totalCost: 0.1,
    ...over,
  };
}

describe('decideExtraction', () => {
  it('picks the first passing candidate even when a later one is better', () => {
    const decision = decideExtraction('news', metrics({ arm: 'base' }), [
      metrics({ arm: 'first', onMapRate: 0.5 }),
      metrics({ arm: 'second', onMapRate: 0.6 }),
    ]);
    expect(decision.winner).toBe('first');
  });

  it('rejects an on-map rate 3.1 points below baseline', () => {
    const decision = decideExtraction('news', metrics({ arm: 'base', onMapRate: 0.5 }), [
      metrics({ arm: 'cand', onMapRate: 0.469 }),
    ]);
    expect(decision.winner).toBeNull();
    expect(decision.evaluations[0]!.rules.find((r) => r.id === 'R3')!.pass).toBe(false);
  });

  it('allows one item of on-map tolerance for n = 20', () => {
    const base = metrics({ arm: 'base', n: 20, onMapRate: 10 / 20 });
    expect(decideExtraction('news', base, [metrics({ arm: 'c', n: 20, onMapRate: 9 / 20 })]).winner).toBe('c');
    expect(decideExtraction('news', base, [metrics({ arm: 'c', n: 20, onMapRate: 8 / 20 })]).winner).toBeNull();
  });

  it('treats police items left out of an accepted response as "no location", but news omissions as defects', () => {
    // Production marks an omitted police report attempted exactly like a null label;
    // an omitted news item stays unassessed and is re-sent next run.
    // n = 100: the defect limit is one item.
    const omitting = { n: 100, missing: 6, omitted: 6 };
    const policeBase = metrics({ arm: 'base', site: 'police', n: 100 });
    expect(decideExtraction('police', policeBase, [metrics({ arm: 'c', site: 'police', ...omitting })]).winner).toBe('c');
    expect(decideExtraction('news', metrics({ arm: 'base', n: 100 }), [metrics({ arm: 'c', ...omitting })]).winner).toBeNull();
    // Items lost for any other reason still count against a police candidate.
    expect(decideExtraction('police', policeBase, [metrics({ arm: 'c', site: 'police', n: 100, missing: 8, omitted: 6 })]).winner).toBeNull();
  });

  it('fails a candidate with a rejected batch or a refusal', () => {
    const base = metrics({ arm: 'base' });
    expect(decideExtraction('news', base, [metrics({ arm: 'c', rejected: 1 })]).winner).toBeNull();
    expect(decideExtraction('news', base, [metrics({ arm: 'c', refusals: 1 })]).winner).toBeNull();
  });

  it('applies the agreement rules to news only', () => {
    const base = metrics({ arm: 'base' });
    expect(decideExtraction('news', base, [metrics({ arm: 'c', relevanceAgreement: 0.85 })]).winner).toBeNull();
    expect(decideExtraction('police', { ...base, site: 'police' }, [metrics({ arm: 'c', site: 'police', relevanceAgreement: undefined })]).winner).toBe('c');
  });

  it('reports no winner when nothing passes', () => {
    const decision = decideExtraction('news', metrics({ arm: 'base' }), [
      metrics({ arm: 'a', junkLabels: 1 }),
      metrics({ arm: 'b', apiErrors: 1 }),
    ]);
    expect(decision.winner).toBeNull();
    expect(decision.evaluations.map((e) => e.pass)).toEqual([false, false]);
  });
});
