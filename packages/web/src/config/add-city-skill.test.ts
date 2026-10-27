import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CityConfig } from '@city-monitor/shared';

// Keeps the add-city skill (.claude/skills/add-city/) true to the code it
// describes, and every configured city in the tables each city needs.

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SKILL_DIR = resolve(REPO_ROOT, '.claude/skills/add-city');
const SKILL_FILES = ['SKILL.md', 'city-keyed-code.md', 'source-lookups.md'];

const read = (path: string) => readFileSync(path, 'utf8');

// The web's city configs. index.test.ts checks the server configures the same cities.
const cityModules = import.meta.glob<Record<string, CityConfig>>('./cities/*.ts', { eager: true });
const cities = Object.entries(cityModules).map(([path, mod]) => ({
  file: path.replace(/^\.\/cities\//, '').replace(/\.ts$/, ''),
  config: Object.values(mod)[0]!,
}));

/** Backticked repo paths, without placeholders such as `og-<id>.png`. */
function namedPaths(markdown: string): string[] {
  const pattern = /`((?:packages|shared|harness|scripts|\.context|\.claude)\/[^`\s<>*]+|README\.md|CLAUDE\.md|render\.yaml)`/g;
  return [...markdown.matchAll(pattern)].map((m) => m[1]!);
}

interface TableRow {
  find: string;
  file: string;
  neededFor: string;
}

/** Rows of a Markdown table whose first two cells are backticked: text to find, then a file. */
function tableRows(markdown: string): TableRow[] {
  const rows: TableRow[] = [];
  for (const line of markdown.split('\n')) {
    const m = /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|/.exec(line);
    if (m) rows.push({ find: m[1]!, file: m[2]!, neededFor: m[3]! });
  }
  return rows;
}

const mentions = (text: string, id: string) => new RegExp(`(^|[^a-z0-9-])${id}($|[^a-z0-9-])`).test(text);

describe('add-city skill', () => {
  const docs = SKILL_FILES.map((name) => ({ name, text: read(resolve(SKILL_DIR, name)) }));
  const rows = tableRows(read(resolve(SKILL_DIR, 'city-keyed-code.md')));

  it('is a project skill named add-city', () => {
    expect(docs[0]!.text).toMatch(/^---\nname: add-city\ndescription: \S/);
  });

  it('names only files that exist', () => {
    const missing = docs.flatMap(({ name, text }) =>
      namedPaths(text).filter((p) => !existsSync(resolve(REPO_ROOT, p))).map((p) => `${name}: ${p}`),
    );
    expect(missing).toEqual([]);
  });

  it('lists places in the code that are still there', () => {
    expect(rows.length).toBeGreaterThan(20);
    const stale = rows
      .filter(({ find, file }) => !existsSync(resolve(REPO_ROOT, file)) || !read(resolve(REPO_ROOT, file)).includes(find))
      .map(({ find, file }) => `${find} in ${file}`);
    expect(stale).toEqual([]);
  });

  it('finds every configured city in each place every city needs', () => {
    const needed = rows.filter(({ neededFor }) => neededFor === 'every city' || neededFor === 'every DE city');
    expect(needed.length).toBeGreaterThan(0);
    const gaps = needed.flatMap(({ file, neededFor }) => {
      const text = read(resolve(REPO_ROOT, file));
      return cities
        .filter(({ config }) => neededFor === 'every city' || config.country === 'DE')
        .filter(({ config }) => !mentions(text, config.id))
        .map(({ config }) => `${config.id} in ${file}`);
    });
    expect(gaps).toEqual([]);
  });
});

describe('every configured city', () => {
  // The API refuses any other ID with 400 (packages/server/src/lib/validate-city.ts).
  const source = read(resolve(REPO_ROOT, 'packages/server/src/lib/validate-city.ts'));
  const cityIdPattern = new RegExp(/CITY_ID_PATTERN = \/(.+)\/;/.exec(source)![1]!);

  it('has an ID the API accepts, named like its config file', () => {
    expect(cities.length).toBeGreaterThan(0);
    for (const { file, config } of cities) {
      expect(cityIdPattern.test(config.id), config.id).toBe(true);
      expect(config.id).toBe(file);
    }
  });
});
