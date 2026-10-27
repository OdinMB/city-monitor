import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/**
 * The gesture hint on touch phones is MapLibre's white text on its own dark
 * overlay. jsdom applies no stylesheet, so this reads the rule that darkens
 * the overlay and checks the contrast it gives over the light map.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const maplibreCss = () =>
  readFileSync(createRequire(import.meta.url).resolve('maplibre-gl/dist/maplibre-gl.css'), 'utf8');

const OVERLAY_RULE = /\.maplibregl-map \.maplibregl-cooperative-gesture-screen \{[^}]*\}/;
const LIGHT_MAP = [0xfa, 0xfa, 0xf8]; // CARTO positron's background

function luminance([r, g, b]: number[]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

describe('gesture hint overlay', () => {
  it('gives the white hint text at least 4.5:1 over the light map', () => {
    const rule = read('../../globals.css').match(OVERLAY_RULE)?.[0] ?? '';
    const alpha = Number(rule.match(/background: rgba\(0, 0, 0, ([\d.]+)\);/)?.[1]);
    expect(alpha).toBeGreaterThan(0);

    const behindText = LIGHT_MAP.map((c) => c * (1 - alpha));
    const contrast = 1.05 / (luminance(behindText) + 0.05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  it('outranks MapLibre\'s own rule, which loads later with one class', () => {
    // A selector of equal weight in maplibre-gl.css (minified) would win by
    // coming last; its own is the bare class.
    expect(maplibreCss()).toMatch(/(^|\})\s*\.maplibregl-cooperative-gesture-screen\s*\{[^}]*background:/);
    expect(read('../../globals.css')).toMatch(OVERLAY_RULE);
  });
});
