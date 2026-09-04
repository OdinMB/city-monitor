import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Guards the two silent failure modes of the hero's height, neither of which
 * any rendering test can catch: jsdom and headless Chrome have no retracting
 * browser chrome, so 100svh and 100vh compute identically there.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('hero height', () => {
  it('sizes the hero with h-hero, never h-screen (100vh is the iOS large viewport)', () => {
    const layout = read('./CommandLayout.tsx');
    expect(layout).toContain('h-hero');
    // Word boundary so this asserts on h-screen itself, not min-h-screen.
    expect(layout).not.toMatch(/(?<!-)\bh-screen\b/);
  });

  it('keeps a 100vh fallback in the shape that survives production optimization', () => {
    const rule = read('../../globals.css').match(/@utility h-hero \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(rule).toContain('height: 100vh;');
    expect(rule).toContain('@supports (height: 100svh)');
    expect(rule).toContain('height: 100svh;');
    // A bare `height: 100vh; height: 100svh;` pair is deleted by Tailwind's
    // Lightning CSS pass (hardcoded Safari 16.4 target), taking the fallback
    // with it. Only the @supports form survives the production build.
    expect(rule).not.toMatch(/height: 100vh;\s*height: 100svh;/);
  });
});
