import { describe, expect, it } from 'vitest';
import i18n from 'i18next';
import { bikeShare, changeFromUsual, telraamPopupHtml } from './telraam-counts';

describe('bikeShare', () => {
  it('is bikes over all vehicles counted, pedestrians aside', () => {
    expect(bikeShare({ bikes: 250, cars: 700, heavy: 50 })).toBe(0.25);
    expect(bikeShare({ bikes: 0, cars: 0, heavy: 0 })).toBe(0);
  });
});

describe('changeFromUsual', () => {
  it('writes the change in whole percent with a real minus sign', () => {
    expect(changeFromUsual(1150, 1000)).toBe('+15 %');
    expect(changeFromUsual(920, 1000)).toBe('−8 %');
    expect(changeFromUsual(1000, 1000)).toBe('±0 %');
  });

  it('gives nothing without a usual value to compare with', () => {
    expect(changeFromUsual(10, null)).toBeNull();
    expect(changeFromUsual(10, 0)).toBeNull();
  });
});

describe('telraamPopupHtml', () => {
  const base = {
    id: 9000001786, street: 'Oranienstraße', district: 'Kreuzberg', date: '2026-11-02', hours: 8,
    cars: 2300, bikes: 700, pedestrians: 300, heavy: 400,
  };

  it('says when there is no usual value and links the segment on telraam.net', async () => {
    await i18n.changeLanguage('en');
    const el = document.createElement('div');
    el.innerHTML = telraamPopupHtml({ ...base, usualCars: null, usualBikes: null, usualPedestrians: null, usualHeavy: null, usualDays: null }, false);
    expect(el.textContent).toContain('No usual value to compare with');
    expect(el.textContent).not.toContain('%)');
    expect(el.querySelector('a')!.getAttribute('href')).toBe('https://telraam.net/en/location/9000001786');
  });

  it('escapes a street name from the data', async () => {
    await i18n.changeLanguage('en');
    const el = document.createElement('div');
    el.innerHTML = telraamPopupHtml({ ...base, street: '<img src=x onerror="alert(1)">' }, true);
    expect(el.querySelector('img')).toBeNull();
  });
});
