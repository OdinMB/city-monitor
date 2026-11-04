import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { PrivacyPage } from './PrivacyPage.js';
import { getAllCities } from '../config/index.js';

/**
 * The privacy page lists the third-party hosts a visitor's browser contacts
 * and the values the app keeps in browser storage. These tests keep both lists
 * in step with the code that decides them: the deployed Content-Security-Policy
 * (a host missing there is blocked in production), the HTML shell, which loads
 * scripts before the app runs, and every storage key in the web source.
 */

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** The value of `const <name> = '…'` in the same file. */
function constantIn(src: string, name: string): string | undefined {
  return src.match(new RegExp(`const ${name}\\s*=\\s*(['"\`])([^'"\`]+)\\1`))?.[2];
}

/**
 * Cookie names in a file that touches `document.cookie`: a literal assigned
 * to it (`document.cookie = 'name=…'`) or the start of a template the file
 * builds the assignment from (`${NAME}=…`, NAME a `const` in the same file).
 * A file that touches the cookie but names none fails the test.
 */
function cookieNames(file: string, src: string): string[] {
  if (!/\bdocument\.cookie\b/.test(src)) return [];
  const names = [
    ...[...src.matchAll(/document\.cookie\s*=\s*(['"`])([A-Za-z0-9_-]+)=/g)].map((m) => m[2]),
    ...[...src.matchAll(/`\$\{([A-Za-z_$][\w$]*)\}=/g)].map((m) => constantIn(src, m[1])),
  ].filter((name): name is string => name !== undefined);
  if (names.length === 0) throw new Error(`${file}: uses document.cookie but no cookie name could be resolved`);
  return names;
}

/**
 * Keys passed to localStorage/sessionStorage getItem/setItem/removeItem, as a
 * string literal or a `const` in the same file, the i18next language
 * detector's storage key, and the names of cookies the app sets. A key the
 * scan cannot resolve fails the test.
 */
function storageKeys(): string[] {
  const keys = new Set<string>();
  const files = [...sourceFiles(SRC_DIR), join(SRC_DIR, '..', 'index.html')];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\b(?:local|session)Storage\.(?:getItem|setItem|removeItem)\(\s*([^,)]+)/g)) {
      const arg = m[1].trim();
      const literal = arg.match(/^(['"`])([^'"`]+)\1$/);
      const constant = /^[A-Za-z_$][\w$]*$/.test(arg) ? constantIn(src, arg) : undefined;
      const key = literal?.[2] ?? constant;
      if (!key) throw new Error(`${file}: cannot resolve storage key ${arg}`);
      keys.add(key);
    }
    for (const m of src.matchAll(/lookup(?:Local|Session)Storage:\s*(['"])([^'"]+)\1/g)) keys.add(m[2]);
    for (const name of cookieNames(file, src)) keys.add(name);
  }
  return [...keys];
}

/**
 * Third-party hosts only: the site's own domain and its subdomains, such as
 * the API on api.citymonitor.app, are first party and need no row.
 */
function thirdPartyHostsIn(text: string): string[] {
  const hosts = [...text.matchAll(/https:\/\/(?:\*\.)?([a-z0-9.-]+)/g)]
    .map((m) => m[1])
    .filter((host) => host !== 'citymonitor.app' && !host.endsWith('.citymonitor.app'));
  return [...new Set(hosts)];
}

function cspHosts(): string[] {
  const blueprint = read('../../../../render.yaml');
  const csp = blueprint.match(/name: Content-Security-Policy\s+value: "([^"]+)"/)?.[1];
  if (!csp) throw new Error('Content-Security-Policy header not found in render.yaml');
  return thirdPartyHostsIn(csp);
}

function htmlShellHosts(): string[] {
  return thirdPartyHostsIn(read('../../index.html'));
}

function renderPage(): HTMLElement {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>
    </HelmetProvider>,
  ).container;
}

function pageText(): string {
  return renderPage().textContent ?? '';
}

describe('PrivacyPage third-party hosts', () => {
  it('names every third-party host the deployed Content-Security-Policy allows', () => {
    const hosts = cspHosts();
    expect(hosts.length).toBeGreaterThan(0);
    const text = pageText();
    for (const host of hosts) expect(text, host).toContain(host);
  });

  it('names every third-party host the HTML shell loads from', () => {
    const hosts = htmlShellHosts();
    expect(hosts).toContain('scripts.simpleanalyticscdn.com');
    const text = pageText();
    for (const host of hosts) expect(text, host).toContain(host);
  });
});

describe('PrivacyPage stored values', () => {
  it('lists exactly the browser storage keys the app uses', () => {
    const keys = storageKeys();
    expect(keys).toEqual(expect.arrayContaining(['theme', 'language', 'cm_setup']));

    const heading = within(renderPage()).getByRole('heading', { level: 2, name: 'What We Store on Your Device' });
    const listed = [...heading.closest('section')!.querySelectorAll('.font-mono')]
      .map((el) => el.textContent)
      .filter((text) => text !== 'localStorage');
    expect([...listed].sort()).toEqual([...keys].sort());
  });
});

describe('PrivacyPage data sources link', () => {
  it('links the data sources page of every active city, not one city alone', () => {
    const hrefs = [...renderPage().querySelectorAll('a')].map((a) => a.getAttribute('href'));
    for (const city of getAllCities()) expect(hrefs).toContain(`/${city.id}/sources`);
  });
});
