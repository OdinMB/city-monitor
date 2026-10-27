import { describe, it, expect, vi, beforeAll } from 'vitest';
import i18n from 'i18next';
import type * as maplibregl from 'maplibre-gl';
import { gestureHintLocale, setCooperativeGestures } from './gestures.js';

// test-setup.ts mocks maplibre-gl; these tests drive MapLibre's own handler,
// which builds the hint from the map's locale table, on a stand-in map.
let actual: typeof import('maplibre-gl');
beforeAll(async () => {
  actual = await vi.importActual<typeof import('maplibre-gl')>('maplibre-gl');
});

function standInMap() {
  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'maplibregl-canvas-container maplibregl-touch-drag-pan';
  const map = {
    _locale: {} as Record<string, string>,
    // MapLibre's own lookup: it throws on an id the table lacks.
    _getUIString: actual.Map.prototype._getUIString,
    getCanvasContainer: () => canvasContainer,
    fire: vi.fn(),
  } as unknown as maplibregl.Map;
  map.cooperativeGestures = new actual.CooperativeGesturesHandler(map, false);
  return { map, canvasContainer };
}

const hint = (el: HTMLElement) => el.querySelectorAll<HTMLElement>('.maplibregl-cooperative-gesture-screen');
const touchHint = (el: HTMLElement) => el.querySelector('.maplibregl-mobile-message')?.textContent;

describe('gestureHintLocale', () => {
  it.each(['de', 'en', 'tr', 'ar'])('gives every hint string in %s', (lng) => {
    const locale = gestureHintLocale(i18n.getFixedT(lng));
    const english = gestureHintLocale(i18n.getFixedT('en'));
    expect(Object.keys(locale).sort()).toEqual([
      'CooperativeGesturesHandler.MacHelpText',
      'CooperativeGesturesHandler.MobileHelpText',
      'CooperativeGesturesHandler.WindowsHelpText',
    ]);
    for (const [id, text] of Object.entries(locale)) {
      expect(text).not.toMatch(/^panel\./);
      if (lng !== 'en') expect(text).not.toBe(english[id]);
    }
  });
});

describe('setCooperativeGestures', () => {
  it('turns them on with the hint in the UI language', () => {
    const { map, canvasContainer } = standInMap();
    setCooperativeGestures(map, true, gestureHintLocale(i18n.getFixedT('de')));

    expect(map.cooperativeGestures.isEnabled()).toBe(true);
    // MapLibre's CSS lets one finger scroll the page through this class.
    expect(canvasContainer.classList.contains('maplibregl-cooperative-gestures')).toBe(true);
    expect(touchHint(canvasContainer)).toBe(i18n.getFixedT('de')('panel.map.gestureHint.touch'));
  });

  it('keeps the hint out of the focus order and the accessibility tree', () => {
    const { map, canvasContainer } = standInMap();
    setCooperativeGestures(map, true, gestureHintLocale(i18n.getFixedT('en')));

    const [screen] = hint(canvasContainer);
    expect(screen.getAttribute('aria-hidden')).toBe('true');
    expect(screen.querySelector('a, button, input, select, textarea, [tabindex]')).toBeNull();
  });

  it('rewrites the hint when the language changes', () => {
    const { map, canvasContainer } = standInMap();
    setCooperativeGestures(map, true, gestureHintLocale(i18n.getFixedT('de')));
    setCooperativeGestures(map, true, gestureHintLocale(i18n.getFixedT('ar')));

    expect(hint(canvasContainer)).toHaveLength(1);
    expect(touchHint(canvasContainer)).toBe(i18n.getFixedT('ar')('panel.map.gestureHint.touch'));
  });

  it('turns them off again, hint and all', () => {
    const { map, canvasContainer } = standInMap();
    setCooperativeGestures(map, true, gestureHintLocale(i18n.getFixedT('en')));
    setCooperativeGestures(map, false, gestureHintLocale(i18n.getFixedT('en')));

    expect(map.cooperativeGestures.isEnabled()).toBe(false);
    expect(hint(canvasContainer)).toHaveLength(0);
    expect(canvasContainer.classList.contains('maplibregl-cooperative-gestures')).toBe(false);
  });

  it('leaves a map that is off as it is', () => {
    const { map, canvasContainer } = standInMap();
    setCooperativeGestures(map, false, gestureHintLocale(i18n.getFixedT('en')));

    expect(map.cooperativeGestures.isEnabled()).toBe(false);
    expect(hint(canvasContainer)).toHaveLength(0);
  });
});
