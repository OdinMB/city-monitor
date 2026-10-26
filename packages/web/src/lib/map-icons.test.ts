import { describe, it, expect } from 'vitest';
import { wrapText, createVerticalBadgeIcon, type IconNode } from './map-icons.js';

/**
 * jsdom's canvas doesn't implement measureText, so we create a mock context
 * that approximates character width at ~7px per character (bold 11px sans-serif).
 */
function mockMeasureCtx(): CanvasRenderingContext2D {
  return {
    measureText: (text: string) => ({ width: text.length * 7 }),
  } as unknown as CanvasRenderingContext2D;
}

describe('wrapText', () => {
  const ctx = mockMeasureCtx();

  it('returns single line for short text', () => {
    const result = wrapText(ctx, 'Hi', 100, 3);
    expect(result).toEqual(['Hi']);
  });

  it('wraps text that exceeds maxWidth', () => {
    // "Hello World Foo" = 15 chars * 7 = 105px, maxWidth 50 → must wrap
    const result = wrapText(ctx, 'Hello World Foo', 50, 3);
    expect(result.length).toBeGreaterThan(1);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('respects maxLines limit', () => {
    const result = wrapText(ctx, 'A B C D E F G H I J', 15, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('adds ellipsis when truncating on last line', () => {
    // Many short words, very narrow width → forced to truncate
    const result = wrapText(ctx, 'A B C D E F G H I J K L', 15, 2);
    expect(result.length).toBe(2);
    expect(result[result.length - 1]).toContain('…');
  });

  it('handles single word that fits', () => {
    const result = wrapText(ctx, 'Short', 100, 3);
    expect(result).toEqual(['Short']);
  });

  it('handles empty-ish input', () => {
    const result = wrapText(ctx, '', 100, 3);
    expect(result).toEqual(['']);
  });

  it('keeps words together when they fit on a line', () => {
    // "Ab Cd" = 5 chars * 7 = 35px, maxWidth 40 → fits on one line
    const result = wrapText(ctx, 'Ab Cd', 40, 3);
    expect(result).toEqual(['Ab Cd']);
  });

  it('wraps at word boundaries', () => {
    // "Hello World" = 11 chars * 7 = 77px, maxWidth 50
    // "Hello" = 35px fits, "Hello World" = 77px doesn't
    const result = wrapText(ctx, 'Hello World', 50, 3);
    expect(result).toEqual(['Hello', 'World']);
  });
});

describe('createVerticalBadgeIcon', () => {
  const ICON: IconNode = [['line', { x1: 0, y1: 0, x2: 24, y2: 24 }]];

  /** Draws a badge on a recording canvas; returns the glyph stroke and text fill colours. */
  function drawnColours(fgColor?: string): { glyph: string[]; text: string[] } {
    const out = { glyph: [] as string[], text: [] as string[] };
    let inGlyph = false;
    const ctx: Record<string, unknown> = {
      measureText: (t: string) => ({ width: t.length * 7 }),
      beginPath() {}, roundRect() {}, fill() {}, fillRect() {}, moveTo() {}, lineTo() {}, translate() {}, scale() {},
      save() { inGlyph = true; },
      restore() { inGlyph = false; },
      stroke() { if (inGlyph) out.glyph.push(ctx.strokeStyle as string); },
      fillText() { out.text.push(ctx.fillStyle as string); },
      getImageData: () => ({}),
    };
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof original;
    try {
      createVerticalBadgeIcon(ICON, '#FFFF00', '#ffffff', '85 US AQI', undefined, fgColor);
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
    return out;
  }

  it('draws glyph and text in white by default', () => {
    expect(drawnColours()).toEqual({ glyph: ['#ffffff'], text: ['#ffffff'] });
  });

  it('draws glyph and text in the foreground colour it is given', () => {
    expect(drawnColours('#1f2937')).toEqual({ glyph: ['#1f2937'], text: ['#1f2937'] });
  });
});
