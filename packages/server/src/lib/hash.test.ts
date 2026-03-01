/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { hashString } from './hash.js';

describe('hashString (FNV-1a)', () => {
  it('produces consistent output for the same input', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
  });

  it('produces different output for different inputs', () => {
    expect(hashString('hello')).not.toBe(hashString('world'));
  });

  it('handles empty string', () => {
    const result = hashString('');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a base-36 string', () => {
    const result = hashString('test');
    expect(result).toMatch(/^[0-9a-z]+$/);
  });
});
