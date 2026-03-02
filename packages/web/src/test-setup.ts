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

// Mock maplibre-gl globally — WebGL is not available in jsdom
vi.mock('maplibre-gl', () => {
  const MockMap = vi.fn().mockImplementation(() => ({
    addControl: vi.fn(),
    remove: vi.fn(),
    setStyle: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  }));
  return {
    default: {
      Map: MockMap,
      NavigationControl: vi.fn(),
      AttributionControl: vi.fn(),
    },
    Map: MockMap,
    NavigationControl: vi.fn(),
    AttributionControl: vi.fn(),
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
