import { describe, it, expect, afterEach } from 'vitest';
import i18n from 'i18next';
import { FSI, ISOLATE_CONTROL, PDI, forwardArrow, isolate } from './bidi.js';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('isolate', () => {
  it('wraps the text in a first-strong isolate (U+2068 … U+2069)', () => {
    expect([FSI, PDI].map((c) => c.codePointAt(0))).toEqual([0x2068, 0x2069]);
    expect(isolate('-3°')).toBe(`${FSI}-3°${PDI}`);
    expect(isolate('37.4 مليار')).toBe(`${FSI}37.4 مليار${PDI}`);
  });

  it('leaves the visible text as it was', () => {
    expect(isolate('16 km/h').slice(1, -1)).toBe('16 km/h');
  });
});

describe('ISOLATE_CONTROL', () => {
  it('matches the four isolate controls (U+2066 to U+2069) and nothing else', () => {
    for (const code of [0x2066, 0x2067, 0x2068, 0x2069]) {
      expect(ISOLATE_CONTROL.test(String.fromCodePoint(code))).toBe(true);
    }
    // U+200E LEFT-TO-RIGHT MARK, which Arabic number formatting puts before a minus.
    expect(ISOLATE_CONTROL.test(`${String.fromCodePoint(0x200e)}-12,345 km/h`)).toBe(false);
  });
});

describe('forwardArrow', () => {
  it('points along the reading direction of the UI language', async () => {
    expect(forwardArrow('en')).toBe('→');
    expect(forwardArrow('ar')).toBe('←');
    await i18n.changeLanguage('ar');
    expect(forwardArrow()).toBe('←');
  });
});
