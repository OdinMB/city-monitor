import { describe, it, expect, afterEach } from 'vitest';
import i18n from 'i18next';
import en from '../i18n/en.json';
import de from '../i18n/de.json';
import tr from '../i18n/tr.json';
import ar from '../i18n/ar.json';
import { getAqiLevel, getUsAqiLevel, getAqiLevelOnScale, gridPointScale, isWaqiStation } from './aqi.js';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('getUsAqiLevel', () => {
  it.each([
    [0, 'good', '#00E400'],
    [50, 'good', '#00E400'],
    [51, 'moderate', '#FFFF00'],
    [100, 'moderate', '#FFFF00'],
    [101, 'unhealthySensitive', '#FF7E00'],
    [150, 'unhealthySensitive', '#FF7E00'],
    [151, 'unhealthy', '#FF0000'],
    [200, 'unhealthy', '#FF0000'],
    [201, 'veryUnhealthy', '#8F3F97'],
    [300, 'veryUnhealthy', '#8F3F97'],
    [301, 'hazardous', '#7E0023'],
    [500, 'hazardous', '#7E0023'],
  ])('puts %i in the US band %s', (aqi, label, color) => {
    const level = getUsAqiLevel(aqi);
    expect(level.label).toBe(label);
    expect(level.color).toBe(color);
    expect(level.labelKey).toBe(`panel.airQuality.usLevel.${label}`);
  });

  it('uses dark badge text on the light bands and white on the dark ones', () => {
    expect([25, 75, 125].map((v) => getUsAqiLevel(v).textColor)).toEqual(['#1f2937', '#1f2937', '#1f2937']);
    expect([175, 250, 400].map((v) => getUsAqiLevel(v).textColor)).toEqual(['#ffffff', '#ffffff', '#ffffff']);
  });
});

describe('getAqiLevel (European)', () => {
  it.each([
    [20, 'good'], [21, 'fair'], [40, 'fair'], [41, 'moderate'], [60, 'moderate'],
    [61, 'poor'], [80, 'poor'], [81, 'veryPoor'], [100, 'veryPoor'], [101, 'extremelyPoor'],
  ])('puts %i in the European band %s', (aqi, label) => {
    const level = getAqiLevel(aqi);
    expect(level.label).toBe(label);
    expect(level.labelKey).toBe(`panel.airQuality.level.${label}`);
    expect(level.textColor).toBe('#ffffff');
  });

  it.each([
    ['en', 'Extremely Poor'],
    ['de', 'Extrem schlecht'],
    ['tr', 'Son Derece Kötü'],
    ['ar', 'سيئ للغاية'],
  ])('names the top European band "extremely poor", not the US "hazardous" (%s)', async (lang, name) => {
    await i18n.changeLanguage(lang);
    expect(i18n.t(getAqiLevel(150).labelKey)).toBe(name);
    expect(i18n.t(getAqiLevel(150).labelKey)).not.toBe(i18n.t(getUsAqiLevel(400).labelKey));
  });
});

describe('US band names', () => {
  const US_LABELS = [0, 75, 125, 175, 250, 400].map((v) => getUsAqiLevel(v).label);

  it.each([['en', en], ['de', de], ['tr', tr], ['ar', ar]] as const)('are all translated in %s', (_lang, bundle) => {
    const names = bundle.panel.airQuality.usLevel as Record<string, string>;
    for (const label of US_LABELS) expect(names[label], label).toMatch(/\S/);
    expect(Object.keys(names).sort()).toEqual([...US_LABELS].sort());
  });

  it('reads the EPA names in English', () => {
    expect(US_LABELS.map((l) => i18n.t(`panel.airQuality.usLevel.${l}`))).toEqual([
      'Good', 'Moderate', 'Unhealthy for Sensitive Groups', 'Unhealthy', 'Very Unhealthy', 'Hazardous',
    ]);
  });
});

describe('grid point scale', () => {
  it('treats aqicn.org stations as WAQI on the US scale', () => {
    const waqi = { url: 'https://aqicn.org/station/@6132/' };
    expect(isWaqiStation(waqi)).toBe(true);
    expect(gridPointScale(waqi)).toBe('us');
  });

  it.each([
    ['a Sensor.Community point', { url: 'https://maps.sensor.community/#17/52.5/13.4' }],
    ['a point without a link', {}],
  ])('keeps %s on the European scale', (_name, point) => {
    expect(isWaqiStation(point)).toBe(false);
    expect(gridPointScale(point)).toBe('eu');
  });

  it('colours the same value by its scale', () => {
    expect(getAqiLevelOnScale(85, 'us').label).toBe('moderate');
    expect(getAqiLevelOnScale(85, 'eu').label).toBe('veryPoor');
  });
});
