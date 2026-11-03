import { describe, expect, it } from 'vitest';
import { isSourceEnabled } from './source-switch.js';

describe('isSourceEnabled', () => {
  it('is on unless the variable is "false"', () => {
    expect(isSourceEnabled('KLINIK_ATLAS', {})).toBe(true);
    expect(isSourceEnabled('KLINIK_ATLAS', { KLINIK_ATLAS: '' })).toBe(true);
    expect(isSourceEnabled('KLINIK_ATLAS', { KLINIK_ATLAS: 'true' })).toBe(true);
    expect(isSourceEnabled('KLINIK_ATLAS', { KLINIK_ATLAS: '0' })).toBe(true);
    expect(isSourceEnabled('KLINIK_ATLAS', { KLINIK_ATLAS: 'false' })).toBe(false);
    expect(isSourceEnabled('KLINIK_ATLAS', { KLINIK_ATLAS: ' FALSE ' })).toBe(false);
    expect(isSourceEnabled('KLINIK_ATLAS', { OTHER: 'false' })).toBe(true);
  });
});
