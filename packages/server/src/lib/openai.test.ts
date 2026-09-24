import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIMessage } from '@langchain/core/messages';
import { summarizeHeadlines, getUsageStats, isConfigured, stripBareCityLabel, checkBatchIndices, geolocateReports, filterAndGeolocateNews } from './openai.js';
import { invokeStructured, type StructuredResult } from './llm-client.js';

vi.mock('./llm-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./llm-client.js')>();
  return { ...actual, invokeStructured: vi.fn() };
});

vi.mock('./geocode.js', () => ({
  geocode: vi.fn().mockResolvedValue({ lat: 52.52, lon: 13.41, displayName: 'Berlin' }),
}));

function modelReturns(parsed: Record<string, unknown>): StructuredResult<Record<string, unknown>> {
  return { parsed, raw: new AIMessage(''), inTok: 10, outTok: 10, ms: 1 };
}

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
    const result = await summarizeHeadlines('Berlin', [{ title: 'Headline 1' }, { title: 'Headline 2' }], ['de'], { now: new Date(), timeZone: 'Europe/Berlin' });
    expect(result).toBeNull();
  });

  it('getUsageStats returns empty object initially', () => {
    const stats = getUsageStats();
    expect(stats).toEqual({});
  });

  it('filterAndGeolocateNews returns null when not configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const { filterAndGeolocateNews } = await import('./openai.js');
    const result = await filterAndGeolocateNews('berlin', 'Berlin', []);
    expect(result).toBeNull();
  });

  it('geolocateReports returns null when not configured', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const { geolocateReports } = await import('./openai.js');
    const result = await geolocateReports('berlin', 'Berlin', []);
    expect(result).toBeNull();
  });
});

describe('stripBareCityLabel', () => {
  it('returns undefined for null input', () => {
    expect(stripBareCityLabel(null, 'berlin')).toBeUndefined();
  });

  it('returns undefined for undefined input', () => {
    expect(stripBareCityLabel(undefined, 'berlin')).toBeUndefined();
  });

  it('strips exact city name', () => {
    expect(stripBareCityLabel('Berlin', 'berlin')).toBeUndefined();
  });

  it('strips city name with comma prefix', () => {
    expect(stripBareCityLabel('Berlin, Mitte', 'berlin')).toBeUndefined();
  });

  it('strips city name with paren prefix', () => {
    expect(stripBareCityLabel('Berlin (Mitte)', 'berlin')).toBeUndefined();
  });

  it('keeps legitimate sub-district label', () => {
    expect(stripBareCityLabel('Kreuzberg', 'berlin')).toBe('Kreuzberg');
  });

  it('keeps city name as substring (not prefix)', () => {
    expect(stripBareCityLabel('Ost-Berlin Museum', 'berlin')).toBe('Ost-Berlin Museum');
  });

  it('returns undefined for empty string', () => {
    expect(stripBareCityLabel('', 'berlin')).toBeUndefined();
  });
});

describe('checkBatchIndices', () => {
  const zeroToNine = Array.from({ length: 10 }, (_, i) => ({ index: i }));

  it('accepts a complete 0-based response', () => {
    const result = checkBatchIndices(zeroToNine, 10);
    expect(result).toEqual({ ok: true, items: zeroToNine, duplicates: 0 });
  });

  it('rejects the whole response when it is numbered from 1', () => {
    const shifted = zeroToNine.map((item) => ({ index: item.index + 1 }));
    expect(checkBatchIndices(shifted, 10).ok).toBe(false);
  });

  it('rejects a negative index', () => {
    expect(checkBatchIndices([{ index: 0 }, { index: -1 }], 10).ok).toBe(false);
  });

  it('rejects a non-integer index', () => {
    expect(checkBatchIndices([{ index: 0 }, { index: 2.5 }], 10).ok).toBe(false);
  });

  it('keeps the first occurrence of a duplicate index and counts it', () => {
    const result = checkBatchIndices(
      [{ index: 0, label: 'first' }, { index: 0, label: 'second' }, { index: 1, label: 'other' }],
      10,
    );
    expect(result).toEqual({
      ok: true,
      items: [{ index: 0, label: 'first' }, { index: 1, label: 'other' }],
      duplicates: 1,
    });
  });
});

describe('index guard on model responses', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.mocked(invokeStructured).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const reports = [{ title: 'Raub am Alexanderplatz' }, { title: 'Unfall am Hermannplatz' }];

  it('geolocateReports places reports from a 0-based response', async () => {
    vi.mocked(invokeStructured).mockResolvedValueOnce(modelReturns({
      items: [{ index: 0, locationLabel: 'Alexanderplatz' }, { index: 1, locationLabel: 'Hermannplatz' }],
    }));
    const result = await geolocateReports('berlin', 'Berlin', reports);
    expect(result?.map((r) => r.index)).toEqual([0, 1]);
    expect(result?.[1]?.locationLabel).toBe('Hermannplatz');
  });

  it('geolocateReports returns null when the response is numbered from 1', async () => {
    vi.mocked(invokeStructured).mockResolvedValueOnce(modelReturns({
      items: [{ index: 1, locationLabel: 'Alexanderplatz' }, { index: 2, locationLabel: 'Hermannplatz' }],
    }));
    expect(await geolocateReports('berlin', 'Berlin', reports)).toBeNull();
  });

  it('filterAndGeolocateNews discards a batch numbered from 1 and keeps the other batches', async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ title: `Headline ${i}`, sourceName: 'rbb24' }));
    const verdict = (index: number) => ({ index, relevant_to_city: true, category: 'local', importance: 0.6, locationLabel: null });
    // First batch (items 0–9) answered 1–10; second batch (items 10–11) answered correctly.
    vi.mocked(invokeStructured)
      .mockResolvedValueOnce(modelReturns({ items: Array.from({ length: 10 }, (_, i) => verdict(i + 1)) }))
      .mockResolvedValueOnce(modelReturns({ items: [verdict(0), verdict(1)] }));

    const result = await filterAndGeolocateNews('berlin', 'Berlin', items);
    expect(result?.map((r) => r.index)).toEqual([10, 11]);
  });
});
