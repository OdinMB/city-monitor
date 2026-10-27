import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from 'tailwindcss';

/**
 * Colour roles (globals.css): a tile says `text-link` or `text-positive`, and
 * each role's light and dark colour is set once. jsdom applies no stylesheet,
 * so this compiles globals.css with Tailwind and follows each role's var()
 * chain to the palette colour it ends at, in the light theme and under `.dark`.
 */

// Each role and the palette colours it stands for: [light, dark]. Changing a
// role's colour is a change here and in globals.css, nowhere else.
const ROLES = {
  link: ['blue-600', 'blue-400'],
  positive: ['green-500', 'green-400'],
  negative: ['red-500', 'red-400'],
  warning: ['amber-700', 'amber-400'],
  muted: ['gray-500', 'gray-400'],
} as const;

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
}

/** Every rule in the CSS, nested ones included, with its declarations in order. */
function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const open: Rule[] = [];
  let buf = '';
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (ch === '{') {
      const rule = { selector: buf.trim(), decls: new Map<string, string>() };
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

/** The custom properties set on <html>: the theme's and the root rules', plus `.dark`'s in dark mode. */
function rootVars(rules: Rule[], dark: boolean): Map<string, string> {
  const vars = new Map<string, string>();
  for (const rule of rules) {
    if (rule.selector !== ':root, :host' && rule.selector !== ':root' && !(dark && rule.selector === '.dark')) continue;
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
  return out;
}

describe('colour roles', () => {
  it.each(Object.entries(ROLES))('text-%s keeps its palette colours in light and dark', async (role, [light, dark]) => {
    const rules = parseRules(await buildCss([`text-${role}`]));
    const utility = rules.find((r) => r.selector === `.text-${role}`);
    expect(utility?.decls.get('color')).toBe(`var(--color-${role})`);

    const lightVars = rootVars(rules, false);
    const darkVars = rootVars(rules, true);
    const lightColour = resolve(`var(--color-${role})`, lightVars);
    const darkColour = resolve(`var(--color-${role})`, darkVars);
    // The same value `text-${light}` and `dark:text-${dark}` paint with.
    expect(lightColour).toBe(resolve(`var(--color-${light})`, lightVars));
    expect(darkColour).toBe(resolve(`var(--color-${dark})`, darkVars));
    expect(lightColour).toMatch(/^oklch\(/);
    expect(darkColour).toMatch(/^oklch\(/);
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
