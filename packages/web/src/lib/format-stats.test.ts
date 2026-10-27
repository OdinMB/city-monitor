import { describe, it, expect } from 'vitest';
import { formatTime, formatDelta, formatYoy } from './format-stats.js';

describe('formatTime', () => {
  it('formats seconds as mm:ss', () => {
    expect(formatTime(452)).toBe('7:32');
  });

  it('pads single-digit seconds', () => {
    expect(formatTime(61)).toBe('1:01');
  });

  it('handles zero', () => {
    expect(formatTime(0)).toBe('0:00');
  });

  it('handles exact minutes', () => {
    expect(formatTime(120)).toBe('2:00');
  });
});

describe('formatDelta', () => {
  it('returns null when previous is undefined', () => {
    expect(formatDelta(100, undefined)).toBeNull();
  });

  it('returns null when previous is 0', () => {
    expect(formatDelta(100, 0)).toBeNull();
  });

  it('shows a rise in the negative role (worse) by default', () => {
    const result = formatDelta(110, 100);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('+10%');
    expect(result!.color).toBe('text-negative');
  });

  it('shows a fall in the positive role (better) by default', () => {
    const result = formatDelta(90, 100);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('-10%');
    expect(result!.color).toBe('text-positive');
  });

  it('inverts color logic when invert=true', () => {
    const result = formatDelta(90, 100, true);
    expect(result).not.toBeNull();
    expect(result!.color).toBe('text-negative');
  });

  it('rounds large percentages', () => {
    const result = formatDelta(200, 100);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('+100%');
  });

  it('shows zero change in the muted role, at AA contrast in both themes', () => {
    const result = formatDelta(100, 100);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('0.0%');
    // The muted role is gray-500 light / gray-400 dark, both 4.5:1 or more;
    // gray-400 on a white tile is 2.6:1.
    expect(result!.color).toBe('text-muted');
  });
});

describe('formatYoy', () => {
  it('shows a rise in the negative role', () => {
    const result = formatYoy(5);
    expect(result.text).toBe('+5%');
    expect(result.color).toBe('text-negative');
  });

  it('shows a fall in the positive role', () => {
    const result = formatYoy(-3.2);
    expect(result.text).toBe('-3.2%');
    expect(result.color).toBe('text-positive');
  });

  it('shows zero in the muted role, at AA contrast in both themes', () => {
    const result = formatYoy(0);
    expect(result.text).toBe('0%');
    expect(result.color).toBe('text-muted');
  });

  it('formats decimal values', () => {
    const result = formatYoy(1.5);
    expect(result.text).toBe('+1.5%');
  });
});
