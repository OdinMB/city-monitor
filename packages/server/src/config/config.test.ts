/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getActiveCities, getCityConfig } from './index.js';

describe('City config', () => {
  beforeEach(() => {
    vi.stubEnv('ACTIVE_CITIES', 'berlin');
  });

  it('returns Berlin config', () => {
    const cities = getActiveCities();
    expect(cities).toHaveLength(1);
    expect(cities[0]!.id).toBe('berlin');
    expect(cities[0]!.name).toBe('Berlin');
    expect(cities[0]!.country).toBe('DE');
  });

  it('getCityConfig returns config for known city', () => {
    const config = getCityConfig('berlin');
    expect(config).toBeDefined();
    expect(config!.timezone).toBe('Europe/Berlin');
  });

  it('getCityConfig returns undefined for unknown city', () => {
    const config = getCityConfig('unknown');
    expect(config).toBeUndefined();
  });

  it('Berlin config has feeds', () => {
    const config = getCityConfig('berlin');
    expect(config!.feeds.length).toBeGreaterThan(0);
  });

  it('Berlin config has weather data source', () => {
    const config = getCityConfig('berlin');
    expect(config!.dataSources.weather.provider).toBe('open-meteo');
  });
});
