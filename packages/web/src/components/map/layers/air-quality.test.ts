import { describe, it, expect, afterEach } from 'vitest';
import i18n from 'i18next';
import { aqPopupHtml } from './air-quality';

/** Markup a hostile feed or translation might carry. */
const MALICIOUS = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

function parse(html: string): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = html;
  return el;
}

const STATION = { aqi: 85, station: 'Berlin Mitte', url: 'https://aqicn.org/station/berlin-mitte' };

describe('aqPopupHtml', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', 'Very Poor'],
    ['de', 'Sehr schlecht'],
    ['tr', 'Çok Kötü'],
    ['ar', 'سيئ جداً'],
  ])('shows the translated level label, not the internal key (%s)', async (lang, label) => {
    await i18n.changeLanguage(lang);
    const text = parse(aqPopupHtml(STATION)).textContent;
    expect(text).toContain(`AQI: 85 (${label})`);
    expect(text).not.toContain('veryPoor');
  });

  it('renders a malicious station name as text, not markup', () => {
    const el = parse(aqPopupHtml({ ...STATION, station: MALICIOUS }));
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.textContent).toContain(MALICIOUS);
  });

  it('escapes the level label like every other popup value', async () => {
    i18n.addResourceBundle('x-hostile', 'translation', { panel: { airQuality: { level: { veryPoor: MALICIOUS } } } }, true, true);
    await i18n.changeLanguage('x-hostile');
    const el = parse(aqPopupHtml(STATION));
    expect(el.querySelector('img, script')).toBeNull();
    expect(el.textContent).toContain(MALICIOUS);
  });

  it('drops a javascript: link but keeps the station', () => {
    const el = parse(aqPopupHtml({ ...STATION, url: 'javascript:alert(1)' }));
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain(STATION.station);
  });
});
