import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';

/**
 * Colour roles (globals.css): a tile says `text-link`, `bg-signal-good` or
 * `badge-good`, and each role's light and dark colour is set once. jsdom
 * applies no stylesheet, so this compiles globals.css with Tailwind, follows
 * each role's var() chain to the value it ends at, in the light theme and under
 * `.dark`, and compares it with what the classes the role replaced paint.
 */

// A colour as tiles wrote it before the role: a palette colour as in a class
// name ('green-600'; 'green-900/30' for Tailwind's alpha tint), or the literal
// a tile set inline ('#22c55e').
type Colour = string;

// Text and fill roles and the colour each stands for: [light, dark].
// text-<role> paints it as text and bg-<role> as a background. Changing a
// role's colour is a change here and in globals.css, nowhere else.
const ROLES: Record<string, [Colour, Colour]> = {
  link: ['blue-600', 'blue-400'],
  positive: ['green-500', 'green-400'],
  negative: ['red-500', 'red-400'],
  warning: ['amber-700', 'amber-400'],
  muted: ['gray-500', 'gray-400'],
  success: ['green-600', 'green-400'],
  caution: ['amber-600', 'amber-400'],
  danger: ['red-500', 'red-400'],
  'level-low': ['green-500', 'green-400'],
  'level-moderate': ['amber-500', 'amber-400'],
  'level-high': ['red-500', 'red-400'],
  'signal-good': ['#22c55e', '#22c55e'],
  'signal-caution': ['#f59e0b', '#f59e0b'],
  'signal-bad': ['#ef4444', '#ef4444'],
  'signal-info': ['#60a5fa', '#60a5fa'],
  'signal-unknown': ['#9ca3af', '#9ca3af'],
  'severity-high': ['red-500', 'red-500'],
  'severity-medium': ['amber-500', 'amber-500'],
  'severity-low': ['gray-400', 'gray-400'],
};

// Badge and tag roles (badge-<role>, tag-<role>) and the colours they stand
// for: [background, text] in light and in dark.
const PAIRS: Record<string, { light: [Colour, Colour]; dark: [Colour, Colour] }> = {
  'badge-neutral': { light: ['gray-100', 'gray-600'], dark: ['gray-800', 'gray-400'] },
  'badge-good': { light: ['green-50', 'green-600'], dark: ['green-900/30', 'green-400'] },
  'badge-good-strong': { light: ['green-100', 'green-700'], dark: ['green-900/40', 'green-400'] },
  'badge-fair': { light: ['yellow-50', 'yellow-600'], dark: ['yellow-900/30', 'yellow-400'] },
  'badge-moderate': { light: ['orange-50', 'orange-600'], dark: ['orange-900/30', 'orange-400'] },
  'badge-moderate-strong': { light: ['orange-100', 'orange-700'], dark: ['orange-900/40', 'orange-400'] },
  'badge-severe': { light: ['red-100', 'red-700'], dark: ['red-900/40', 'red-400'] },
  'badge-caution': { light: ['amber-50', 'amber-600'], dark: ['amber-900/30', 'amber-400'] },
  'badge-info': { light: ['blue-50', 'blue-600'], dark: ['blue-900/30', 'blue-400'] },
  'tag-news-local': { light: ['gray-100', 'gray-700'], dark: ['gray-800', 'gray-300'] },
  'tag-news-transit': { light: ['blue-100', 'blue-700'], dark: ['blue-900', 'blue-300'] },
  'tag-news-politics': { light: ['purple-100', 'purple-700'], dark: ['purple-900', 'purple-300'] },
  'tag-news-culture': { light: ['amber-100', 'amber-700'], dark: ['amber-900', 'amber-300'] },
  'tag-news-crime': { light: ['red-100', 'red-700'], dark: ['red-900', 'red-300'] },
  'tag-news-weather': { light: ['cyan-100', 'cyan-700'], dark: ['cyan-900', 'cyan-300'] },
  'tag-news-economy': { light: ['green-100', 'green-700'], dark: ['green-900', 'green-300'] },
  'tag-news-sports': { light: ['orange-100', 'orange-700'], dark: ['orange-900', 'orange-300'] },
  'tag-event-free': { light: ['green-100', 'green-700'], dark: ['green-900', 'green-300'] },
  'tag-council-bvv': { light: ['blue-50', 'blue-600'], dark: ['blue-900/30', 'blue-400'] },
  'tag-council-parliament': { light: ['purple-50', 'purple-600'], dark: ['purple-900/30', 'purple-400'] },
  // Line badges have no dark variant. White or gray-900 12px bold text at
  // 4.5:1 (WCAG 1.4.3): U 5.3:1, S 4.9:1 (green-600 was 3.2:1), tram 4.8:1,
  // other 6.1:1 (white was 2.9:1).
  'tag-line-u': { light: ['blue-600', 'white'], dark: ['blue-600', 'white'] },
  'tag-line-s': { light: ['green-700', 'white'], dark: ['green-700', 'white'] },
  'tag-line-tram': { light: ['red-600', 'white'], dark: ['red-600', 'white'] },
  'tag-line-other': { light: ['yellow-600', 'gray-900'], dark: ['yellow-600', 'gray-900'] },
};

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

async function buildCss(candidates: string[]): Promise<string> {
  const css = readFileSync(join(SRC_DIR, 'globals.css'), 'utf8');
  const compiler = await compile(css, {
    base: SRC_DIR,
    loadStylesheet: async (id, base) => {
      const path = require.resolve(id === 'tailwindcss' ? 'tailwindcss/index.css' : id, { paths: [base] });
      return { path, base: dirname(path), content: readFileSync(path, 'utf8') };
    },
  });
  return compiler.build(candidates);
}

interface Rule {
  selector: string;
  decls: Map<string, string>;
  parent?: Rule;
}

/** Every rule in the CSS, nested ones included, with its declarations in order. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const open: Rule[] = [];
  let buf = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') {
      const rule: Rule = { selector: buf.trim(), decls: new Map<string, string>(), parent: open[open.length - 1] };
      rules.push(rule);
      open.push(rule);
      buf = '';
    } else if (ch === ';' || ch === '}') {
      const decl = buf.trim();
      const colon = decl.indexOf(':');
      if (open.length > 0 && colon > 0) open[open.length - 1].decls.set(decl.slice(0, colon).trim(), decl.slice(colon + 1).trim());
      buf = '';
      if (ch === '}') open.pop();
    } else {
      buf += ch;
    }
  }
  return rules;
}

/**
 * The custom properties set on <html>: the theme's and the root rules', plus
 * `.dark`'s in dark mode. A block nested in one of them (the @supports branch
 * Tailwind writes after a color-mix() fallback) applies as part of it, since
 * every browser the app supports takes that branch.
 */
function rootVars(rules: Rule[], dark: boolean): Map<string, string> {
  const vars = new Map<string, string>();
  for (const rule of rules) {
    let target: Rule | undefined = rule;
    while (target?.selector.startsWith('@supports') && target.parent) target = target.parent;
    const selector = target!.selector;
    if (selector !== ':root, :host' && selector !== ':root' && !(dark && selector === '.dark')) continue;
    for (const [name, value] of rule.decls) if (name.startsWith('--')) vars.set(name, value);
  }
  return vars;
}

/** Substitutes every var() until a plain value is left; an unset variable fails the test. */
function resolve(value: string, vars: Map<string, string>): string {
  let out = value;
  for (let depth = 0; out.includes('var('); depth++) {
    expect(depth, `var() chain too deep in ${value}`).toBeLessThan(10);
    out = out.replace(/var\((--[\w-]+)\)/g, (_m, name: string) => {
      const next = vars.get(name);
      expect(next, `${name} is not set`).toBeDefined();
      return next!;
    });
  }
  return out.replace(/\s+/g, ' ');
}

function isInside(rule: Rule, ancestors: Rule[]): boolean {
  for (let r: Rule | undefined = rule; r; r = r.parent) if (ancestors.includes(r)) return true;
  return false;
}

/**
 * The value `cls` paints `property` with, in the light or dark theme. The last
 * declaration wins, so for an alpha tint it is the color-mix() a browser
 * applies, not the fallback Tailwind writes before it.
 */
function paint(rules: Rule[], cls: string, property: string, dark: boolean): string {
  const selector = '.' + cls.replace(/[/:]/g, '\\$&');
  const own = rules.filter((r) => r.selector === selector);
  expect(own.length, `${cls} was not generated`).toBeGreaterThan(0);
  let value: string | undefined;
  for (const rule of rules) if (isInside(rule, own) && rule.decls.has(property)) value = rule.decls.get(property);
  expect(value, `${cls} sets no ${property}`).toBeDefined();
  return resolve(value!, rootVars(rules, dark));
}

const PROPERTY = { text: 'color', bg: 'background-color' } as const;

/** What a palette class (or an inline literal) painted before the role: `text-green-600`, `bg-green-900/30`. */
function before(rules: Rule[], kind: keyof typeof PROPERTY, colour: Colour, dark: boolean): string {
  return colour.startsWith('#') ? colour : paint(rules, `${kind}-${colour}`, PROPERTY[kind], dark);
}

const COLOUR_VALUE = /^(oklch\(|#[0-9a-f]{3,8}$|color-mix\(in oklab, oklch\()/;

describe('colour roles', () => {
  let roleRules: Rule[];
  let paletteRules: Rule[];

  beforeAll(async () => {
    roleRules = parseRules(await buildCss([
      ...Object.keys(ROLES).flatMap((role) => [`text-${role}`, `bg-${role}`]),
      ...Object.keys(PAIRS),
    ]));
    const colours = [
      ...Object.values(ROLES).flatMap((pair) => pair.map((c) => ['text', c] as const)),
      ...Object.values(ROLES).flatMap((pair) => pair.map((c) => ['bg', c] as const)),
      ...Object.values(PAIRS).flatMap(({ light, dark }) => [light, dark].flatMap(([bg, text]) => [['bg', bg], ['text', text]] as const)),
    ];
    paletteRules = parseRules(await buildCss(colours.filter(([, c]) => !c.startsWith('#')).map(([kind, c]) => `${kind}-${c}`)));
  });

  it.each(Object.entries(ROLES))('text-%s and its bg- keep their colours in light and dark', (role, [light, dark]) => {
    for (const kind of ['text', 'bg'] as const) {
      const lightColour = paint(roleRules, `${kind}-${role}`, PROPERTY[kind], false);
      const darkColour = paint(roleRules, `${kind}-${role}`, PROPERTY[kind], true);
      expect(lightColour).toBe(before(paletteRules, kind, light, false));
      expect(darkColour).toBe(before(paletteRules, kind, dark, true));
      expect(lightColour).toMatch(COLOUR_VALUE);
      expect(darkColour).toMatch(COLOUR_VALUE);
    }
  });

  it.each(Object.entries(PAIRS))('%s keeps its background and text colours in light and dark', (role, colours) => {
    for (const dark of [false, true]) {
      const [bg, text] = dark ? colours.dark : colours.light;
      const roleBg = paint(roleRules, role, 'background-color', dark);
      const roleText = paint(roleRules, role, 'color', dark);
      expect(roleBg).toBe(before(paletteRules, 'bg', bg, dark));
      expect(roleText).toBe(before(paletteRules, 'text', text, dark));
      expect(roleBg).toMatch(COLOUR_VALUE);
      expect(roleText).toMatch(COLOUR_VALUE);
    }
  });
});

/** Every non-test .ts/.tsx file under src. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('links use the link role', () => {
  it('no class list with hover:underline picks a palette text colour', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_DIR)) {
      const src = readFileSync(file, 'utf8');
      for (const [classes] of src.matchAll(/["'`][^"'`\n]*\bhover:underline\b[^"'`\n]*["'`]/g)) {
        if (/(^|[\s"'`:])text-[a-z]+-\d{2,3}\b/.test(classes)) offenders.push(`${file.slice(SRC_DIR.length + 1)}: ${classes}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('muted text uses the muted role', () => {
  it('no class list spells out the muted pair text-gray-500 dark:text-gray-400', () => {
    const offenders = sourceFiles(SRC_DIR)
      .filter((file) => /\btext-gray-500 dark:text-gray-400\b/.test(readFileSync(file, 'utf8')))
      .map((file) => file.slice(SRC_DIR.length + 1));
    expect(offenders).toEqual([]);
  });
});
