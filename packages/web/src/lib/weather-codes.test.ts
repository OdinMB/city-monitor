/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect } from 'vitest';
import { getWeatherInfo } from './weather-codes.js';

describe('getWeatherInfo', () => {
  it('returns clear sky for code 0', () => {
    const info = getWeatherInfo(0);
    expect(info.label).toMatch(/clear/i);
    expect(info.icon).toBeTruthy();
  });

  it('returns rain for code 61', () => {
    const info = getWeatherInfo(61);
    expect(info.label).toMatch(/rain/i);
  });

  it('returns snow for code 71', () => {
    const info = getWeatherInfo(71);
    expect(info.label).toMatch(/snow/i);
  });

  it('returns thunderstorm for code 95', () => {
    const info = getWeatherInfo(95);
    expect(info.label).toMatch(/thunder/i);
  });

  it('returns a fallback for unknown codes', () => {
    const info = getWeatherInfo(999);
    expect(info.label).toBeTruthy();
    expect(info.icon).toBeTruthy();
  });
});
