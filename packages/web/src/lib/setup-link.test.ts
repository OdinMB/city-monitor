import { describe, it, expect } from 'vitest';
import { readSharedParams, shareUrl, withoutSharedParams } from './setup-link.js';
import { defaultMapState, type DataLayer, type MapState } from '../hooks/useCommandCenter.js';
import type { SharedSetup } from './setup-state.js';

const custom: SharedSetup = {
  name: 'Pendeln & mehr',
  sections: [{ id: 'news', tiles: ['briefing', 'news'] }, { id: 'c1', name: 'Mein Kiez & mehr', tiles: ['weather', 'support'] }],
  hidden: ['budget'],
};
const map: MapState = { ...defaultMapState('berlin'), activeLayers: new Set<DataLayer>(['crime', 'parking']), crimeLayer: 'burglary' };

const searchOf = (url: string) => new URL(url).search;

describe('shared setup links', () => {
  it('points at the city’s dashboard and carries a standard setup by name, and the map state', () => {
    const url = shareUrl('https://citymonitor.app', 'berlin', 'topics', map);
    expect(url.startsWith('https://citymonitor.app/berlin?')).toBe(true);
    expect(new URL(url).searchParams.get('setup')).toBe('topics');
    expect(readSharedParams(searchOf(url))).toEqual({ setup: 'topics', map });
  });

  it('carries a visitor’s setup itself, its name, section names and hidden tiles included', () => {
    const url = shareUrl('https://citymonitor.app', 'koeln', custom, map);
    expect(new URL(url).searchParams.get('setup')).toMatch(/^c\.[A-Za-z0-9_-]+$/);
    expect(readSharedParams(searchOf(url)).setup).toEqual(custom);
  });

  it('stays short: codes, not labels', () => {
    const url = shareUrl('https://citymonitor.app', 'berlin', custom, map);
    expect(url.length).toBeLessThan(600);
  });

  it('ignores malformed parameters, each on its own', () => {
    expect(readSharedParams('?setup=sideways&map=%%%')).toEqual({ setup: null, map: null });
    expect(readSharedParams('?setup=c.notbase64!')).toEqual({ setup: null, map: null });
    expect(readSharedParams('?setup=functional&map=e30')).toEqual({ setup: 'functional', map: {} });
    expect(readSharedParams('')).toEqual({ setup: null, map: null });
  });

  it('removes only its own parameters from the address', () => {
    expect(withoutSharedParams('?setup=topics&map=abc&utm_source=x')).toBe('?utm_source=x');
    expect(withoutSharedParams('?setup=topics&map=abc')).toBe('');
    expect(withoutSharedParams('?lang=de')).toBe('?lang=de');
  });
});
