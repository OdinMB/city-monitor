import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The top bar slides in on scroll but its buttons are always in the Tab order,
 * so a CSS rule shows it while it holds keyboard focus. jsdom applies no
 * stylesheet, so no rendering test can see the rule; this guards its wiring.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

describe('top bar keyboard focus', () => {
  it('marks the sliding block and the bar inside it', () => {
    const shell = read('./Shell.tsx');
    expect(shell).toContain('topbar-slide ');
    expect(shell).toContain('className="topbar-slide-bar"');
  });

  it('shows the bar on keyboard focus only, overriding the inline transform', () => {
    const css = read('../../globals.css');
    const rule = css.match(/\.topbar-slide:has\(\.topbar-slide-bar :focus-visible\) \{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain('transform: none !important;');
    // :focus-within would also pin the bar after a mouse click.
    expect(css).not.toMatch(/\.topbar-slide[^{]*:focus-within/);
  });
});
