import { describe, it, expect } from 'vitest';
import { formatLocalMoment } from './llm-prompts.js';

describe('formatLocalMoment', () => {
  const inBerlin = (iso: string) => formatLocalMoment({ now: new Date(iso), timeZone: 'Europe/Berlin' });

  it('gives the local weekday, date and 24-hour time', () => {
    expect(inBerlin('2026-09-23T12:09:00Z')).toBe('Wednesday, 23 September 2026, 14:09');
  });

  it('moves to the next day at local midnight, before UTC does', () => {
    expect(inBerlin('2026-09-23T22:30:00Z')).toBe('Thursday, 24 September 2026, 00:30');
  });

  it('follows the switch from summer to winter time', () => {
    // CEST (UTC+2) ends at 03:00 local time on Sunday 25 October 2026.
    expect(inBerlin('2026-10-24T12:00:00Z')).toBe('Saturday, 24 October 2026, 14:00');
    expect(inBerlin('2026-10-26T12:00:00Z')).toBe('Monday, 26 October 2026, 13:00');
  });
});
