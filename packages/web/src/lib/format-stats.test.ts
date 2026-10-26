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

  it('shows positive delta as red (worse) by default', () => {
    const result = formatDelta(110, 100);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('+10%');
    expect(result!.color).toContain('text-red');
  });

  it('shows negative delta as green (better) by default', () => {
    const result = formatDelta(90, 100);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('-10%');
    expect(result!.color).toContain('text-green');
  });

  it('inverts color logic when invert=true', () => {
    const result = formatDelta(90, 100, true);
    expect(result).not.toBeNull();
    expect(result!.color).toContain('text-red');
  });

  it('rounds large percentages', () => {
    const result = formatDelta(200, 100);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('+100%');
  });

  it('shows gray for zero change, at AA contrast in both themes', () => {
    const result = formatDelta(100, 100);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('0.0%');
    // gray-400 on a white tile is 2.6:1; gray-500 light / gray-400 dark pass 4.5:1.
    expect(result!.color).toBe('text-gray-500 dark:text-gray-400');
  });
});

describe('formatYoy', () => {
  it('shows positive percent as red', () => {
    const result = formatYoy(5);
    expect(result.text).toBe('+5%');
    expect(result.color).toContain('text-red');
  });

  it('shows negative percent as green', () => {
    const result = formatYoy(-3.2);
    expect(result.text).toBe('-3.2%');
    expect(result.color).toContain('text-green');
  });

  it('shows zero as gray, at AA contrast in both themes', () => {
    const result = formatYoy(0);
    expect(result.text).toBe('0%');
    expect(result.color).toBe('text-gray-500 dark:text-gray-400');
  });

  it('formats decimal values', () => {
    const result = formatYoy(1.5);
    expect(result.text).toBe('+1.5%');
  });
});
