// @vitest-environment node
// Node, not jsdom: the build's esbuild refuses to run under jsdom's globals.
import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import tailwindcss from '@tailwindcss/vite';

/**
 * Checks globals.css as the production build emits it, not as it is written.
 * The build's minifiers (Tailwind's Lightning CSS pass, then Vite's esbuild
 * pass) merge rules with the same declarations into one selector list, and a
 * browser that does not know a selector in a list drops the whole list.
 */

const webRoot = fileURLToPath(new URL('..', import.meta.url));
const globalsCss = fileURLToPath(new URL('./globals.css', import.meta.url));

/**
 * Builds globals.css through the same CSS path as vite.config.ts: the Tailwind
 * plugin, target esnext, Vite's default CSS minifier. No .env file, public
 * folder or output on disk.
 */
async function buildGlobalsCss(): Promise<string> {
  const result = await build({
    configFile: false,
    root: webRoot,
    envDir: false,
    publicDir: false,
    mode: 'production',
    logLevel: 'silent',
    plugins: [tailwindcss()],
    build: { write: false, target: 'esnext', rollupOptions: { input: globalsCss } },
  });
  const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
  const css = outputs
    .flatMap((o) => o.output)
    .filter((file): file is Rollup.OutputAsset => file.type === 'asset' && file.fileName.endsWith('.css'));
  expect(css).toHaveLength(1);
  return String(css[0].source);
}

interface Rule {
  selectors: string[];
  body: string;
  /** Preludes of the at-rules around it, outermost first, such as `@media(...)`. */
  within: string[];
}

/** Splits a selector list at its top-level commas, not those inside :is(), :has() and the like. */
function splitSelectors(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(list.slice(start).trim());
  return parts;
}

/** The style rules of a stylesheet (blocks that hold no further blocks), with the at-rules around each. */
function rulesOf(css: string): Rule[] {
  const rules: Rule[] = [];
  const open: string[] = [];
  let segment = 0; // where the text since the last brace starts
  let lastBrace = '';
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      i = css.indexOf(c, i + 1);
      if (i < 0) throw new Error('unterminated string in the built CSS');
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      if (end < 0) throw new Error('unterminated comment in the built CSS');
      i = end + 1;
    } else if (c === '{') {
      // A statement before the prelude (`@layer a,b;`) ends at its semicolon.
      const text = css.slice(segment, i);
      open.push(text.slice(text.lastIndexOf(';') + 1).replace(/\/\*[\s\S]*?\*\//g, '').trim());
      segment = i + 1;
      lastBrace = c;
    } else if (c === '}') {
      const prelude = open.pop() ?? '';
      if (lastBrace === '{') {
        rules.push({ selectors: splitSelectors(prelude), body: css.slice(segment, i), within: [...open] });
      }
      segment = i + 1;
      lastBrace = c;
    }
  }
  return rules;
}

const needsHas = (selector: string) => selector.includes(':has(');

describe('globals.css as built for production', () => {
  let rules: Rule[];

  beforeAll(async () => {
    rules = rulesOf(await buildGlobalsCss());
  }, 60_000);

  it('builds into style rules this test can read', () => {
    expect(rules.length).toBeGreaterThan(100);
    expect(rules.some((r) => r.selectors.includes('.marquee-track') && r.body.includes('animation:'))).toBe(true);
  });

  it('keeps the news ticker pausing on hover and on its pause button in a browser without :has()', () => {
    const paused = rules.filter((r) => /animation-play-state:\s*paused/.test(r.body));
    const listOf = (selector: string) => paused.filter((r) => r.selectors.includes(selector));
    for (const selector of ['.marquee-viewport:hover .marquee-track', '.marquee-paused .marquee-track']) {
      const lists = listOf(selector);
      expect(lists.length, `${selector} is in the built CSS`).toBeGreaterThan(0);
      for (const rule of lists) {
        expect(rule.selectors.filter(needsHas), `listed with ${selector}`).toEqual([]);
        expect(rule.within.filter((at) => at.startsWith('@supports'))).toEqual([]);
      }
    }
  });

  it('pauses the ticker on keyboard focus only where :has() is supported', () => {
    const focus = rules.filter((r) => r.selectors.includes('.marquee-viewport:has(:focus-visible) .marquee-track'));
    expect(focus).toHaveLength(1);
    expect(focus[0].body).toMatch(/animation-play-state:\s*paused/);
    expect(focus[0].selectors).toHaveLength(1);
    expect(focus[0].within.map((at) => at.replace(/\s+/g, ''))).toContain('@supportsselector(:has(*))');
  });

  it('never lists a selector that works without :has() with one that needs it', () => {
    // Such a list is dropped whole where :has() is unknown, taking the other selector with it.
    const mixed = rules
      .filter((r) => r.selectors.some(needsHas) && !r.selectors.every(needsHas))
      .map((r) => r.selectors.join(','));
    expect(mixed).toEqual([]);
  });
});
