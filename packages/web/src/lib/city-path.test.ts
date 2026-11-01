import { describe, it, expect } from 'vitest';
import { citySwitchPath } from './city-path.js';

describe('citySwitchPath', () => {
  it('leads from a city dashboard to the other city\'s dashboard', () => {
    expect(citySwitchPath('/berlin', 'hamburg')).toBe('/hamburg');
    expect(citySwitchPath('/berlin/', 'hamburg')).toBe('/hamburg');
  });

  it('keeps a sub-page every city has', () => {
    expect(citySwitchPath('/berlin/sources', 'hamburg')).toBe('/hamburg/sources');
    expect(citySwitchPath('/berlin/sources/', 'hamburg')).toBe('/hamburg/sources');
  });

  it('falls back to the dashboard for any other path', () => {
    expect(citySwitchPath('/berlin/unknown', 'hamburg')).toBe('/hamburg');
    expect(citySwitchPath('/berlin/sources/extra', 'hamburg')).toBe('/hamburg');
    expect(citySwitchPath('/privacy', 'hamburg')).toBe('/hamburg');
    expect(citySwitchPath('/', 'hamburg')).toBe('/hamburg');
  });

  it('leads the current city to the page it is already on', () => {
    expect(citySwitchPath('/berlin/sources', 'berlin')).toBe('/berlin/sources');
  });
});
