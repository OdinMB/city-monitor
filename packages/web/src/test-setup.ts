/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Initialize i18n with English translations for tests
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './i18n/en.json';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

// Mock URL.createObjectURL/revokeObjectURL for maplibre-gl in jsdom
window.URL.createObjectURL = window.URL.createObjectURL || (() => '');
window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});

// Mock canvas 2D context for map icon generation (jsdom doesn't support canvas)
const mockCtx = {
  beginPath: vi.fn(),
  roundRect: vi.fn(),
  fill: vi.fn(),
  stroke: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  arcTo: vi.fn(),
  bezierCurveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
  getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
  fillStyle: '',
  strokeStyle: '',
  lineWidth: 1,
  lineCap: 'butt',
  lineJoin: 'miter',
};
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// Mock maplibre-gl globally — WebGL is not available in jsdom
vi.mock('maplibre-gl', () => {
  const MockMap = vi.fn().mockImplementation(() => ({
    addControl: vi.fn(),
    remove: vi.fn(),
    setStyle: vi.fn(),
    on: vi.fn().mockImplementation((_event: string, ...rest: unknown[]) => {
      // 2-arg form: on(event, cb) — auto-invoke (e.g. 'load')
      // 3-arg form: on(event, layer, cb) — skip (user-interaction handlers)
      if (rest.length === 1 && typeof rest[0] === 'function') rest[0]();
    }),
    once: vi.fn().mockImplementation((_event: string, cb: () => void) => { cb(); }),
    off: vi.fn(),
    getLayer: vi.fn().mockReturnValue(null),
    getSource: vi.fn().mockReturnValue(null),
    getStyle: vi.fn().mockReturnValue({ layers: [] }),
    setLayoutProperty: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    setFeatureState: vi.fn(),
    getCanvas: vi.fn().mockReturnValue({ style: {} }),
    isStyleLoaded: vi.fn().mockReturnValue(true),
    hasImage: vi.fn().mockReturnValue(false),
    addImage: vi.fn(),
    removeImage: vi.fn(),
    loadImage: vi.fn().mockResolvedValue({ data: new Uint8Array(4), width: 1, height: 1 }),
  }));
  const MockPopup = vi.fn().mockImplementation(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    setHTML: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
  }));
  return {
    default: {
      Map: MockMap,
      NavigationControl: vi.fn(),
      AttributionControl: vi.fn(),
      Popup: MockPopup,
    },
    Map: MockMap,
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
    Popup: MockPopup,
  };
});

// Mock window.matchMedia for jsdom environment
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
