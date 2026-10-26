import { describe, it, expect, beforeAll, afterAll } from 'vitest';

interface Detector {
  detect: () => string[] | string | undefined;
  cacheUserLanguage: (lng: string) => void;
}

/**
 * The i18next language detector checks once whether localStorage works, inside
 * a try/catch, and keeps the answer for the page. Storage is blocked here
 * before the app's i18n module loads, so that check runs against a browser
 * that throws a SecurityError on any storage access.
 */
describe('i18n with browser storage blocked', () => {
  const saved = Object.getOwnPropertyDescriptor(window, 'localStorage');

  beforeAll(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });

  afterAll(() => {
    if (saved) Object.defineProperty(window, 'localStorage', saved);
  });

  it('initialises, falls back to the browser language and still switches language', async () => {
    const { default: i18n } = await import('./index.js');
    const detector = i18n.services.languageDetector as Detector;

    expect(detector.detect()).toContain(navigator.language);
    expect(() => detector.cacheUserLanguage('de')).not.toThrow();

    await i18n.changeLanguage('de');
    expect(i18n.language).toBe('de');
    expect(i18n.t('error.reload')).toBe('Neu laden');

    await i18n.changeLanguage('en');
  });
});
