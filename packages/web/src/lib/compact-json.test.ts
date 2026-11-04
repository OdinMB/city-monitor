import { describe, it, expect } from 'vitest';
import { decodeJson, encodeJson } from './compact-json.js';

describe('compact JSON', () => {
  it('round-trips any text, umlauts and Arabic included, in URL- and cookie-safe characters', () => {
    const value = { n: 'Großstadt – أخبار', t: ['news', 'weather'], s: 1 };
    const encoded = encodeJson(value);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeJson(encoded)).toEqual(value);
  });

  it('gives undefined for anything that is not what it wrote, without throwing', () => {
    expect(decodeJson('not base64!')).toBeUndefined();
    expect(decodeJson('e30')).toEqual({});
    expect(decodeJson('e3')).toBeUndefined();
    expect(decodeJson('')).toBeUndefined();
    // Valid base64 of bytes that are not UTF-8
    expect(decodeJson('_w')).toBeUndefined();
  });
});
