import { describe, it, expect } from 'vitest';
import { getDefaultCityId } from './index.js';
import { berlin } from './cities/berlin.js';
import { hamburg } from './cities/hamburg.js';

describe('getDefaultCityId', () => {
  it('returns berlin with the shipped active cities', () => {
    expect(getDefaultCityId()).toBe('berlin');
  });

  it('prefers berlin while it is active, even when it is not listed first', () => {
    expect(getDefaultCityId([hamburg, berlin])).toBe('berlin');
  });

  it('returns the first active city when berlin is inactive', () => {
    expect(getDefaultCityId([hamburg])).toBe('hamburg');
  });
});
