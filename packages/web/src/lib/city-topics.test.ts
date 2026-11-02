import { describe, it, expect } from 'vitest';
import i18n from 'i18next';
import { berlin } from '../config/cities/berlin.js';
import { hamburg } from '../config/cities/hamburg.js';
import { koeln } from '../config/cities/koeln.js';
import { cityTopics } from './city-topics.js';

describe('cityTopics', () => {
  it('names a city\'s own topics first, in the picker\'s order', () => {
    expect(cityTopics(['pollen', 'police', 'news']).highlights).toEqual([
      'panel.news.title',
      'sidebar.news.police',
      'panel.pollen.title',
    ]);
  });

  it('counts weather and air quality, which every city has, with its own topics', () => {
    expect(cityTopics(['news', 'police']).count).toBe(4);
  });

  it('falls back to weather and air quality for a city with no topics of its own', () => {
    expect(cityTopics([])).toEqual({ count: 2, highlights: ['panel.weather.title', 'panel.airQuality.title'] });
  });

  it('does not count a feature that only refines another topic', () => {
    expect(cityTopics(['news', 'roadworks', 'noiseTotal', 'districtMayors', 'stateByDistrict']).count).toBe(3);
  });

  it('names at most three', () => {
    expect(cityTopics(berlin.features).highlights).toHaveLength(3);
  });

  it('tells the active cities apart', () => {
    // Hamburg's first three (news, transit, police) are Berlin's since Geofox, so its count tells them apart
    expect(cityTopics(berlin.features).highlights).not.toEqual(cityTopics(koeln.features).highlights);
    expect(cityTopics(berlin.features).count).toBeGreaterThan(cityTopics(hamburg.features).count);
  });

  it('names only topics with a translation in every language', () => {
    const keys = new Set([berlin, hamburg, koeln].flatMap((c) => cityTopics(c.features, 99).highlights));
    for (const lng of ['de', 'en', 'tr', 'ar']) {
      // getResource: no fallback to English.
      for (const key of keys) expect(i18n.getResource(lng, 'translation', key), `${lng}: ${key}`).toBeTruthy();
    }
  });
});
