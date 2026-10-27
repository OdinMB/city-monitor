/**
 * Which city a run shows (--city). A city can be run when both the server
 * and the web app register it in their ALL_CITIES (config/index.ts in each
 * package); the parent reads that from the files, so an unknown city is
 * refused before anything starts. The run's web build makes it the one active
 * city (ACTIVE_CITY_IDS in packages/web/src/config/index.ts), rewritten in
 * the build only: the file in the checkout stays as it is.
 */

import fs from 'node:fs';
import path from 'node:path';
import { REPO } from './paths.mjs';

export const DEFAULT_CITY = 'berlin';

/** The ids the API accepts (CITY_ID_PATTERN in packages/server/src/lib/validate-city.ts). */
export const CITY_ID_PATTERN = /^[a-z][a-z0-9-]{0,30}$/;

export const CITY_CONFIG_FILES = Object.freeze({
  server: path.join(REPO.server, 'src', 'config', 'index.ts'),
  web: path.join(REPO.web, 'src', 'config', 'index.ts'),
});

/** The keys of the one `const ALL_CITIES ... = { ... }` in a config module's source, in order. */
export function registeredCities(source, what = 'the config') {
  const matches = [...source.matchAll(/^const ALL_CITIES\b[^=]*=\s*\{([^}]*)\};/gm)];
  if (matches.length !== 1) throw new Error(`${what}: found ${matches.length} ALL_CITIES objects, expected one`);
  const body = matches[0][1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return body.split(',').map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const match = /^(?:([a-z][a-z0-9]*)|'([a-z][a-z0-9-]*)'|"([a-z][a-z0-9-]*)")(?:\s*:\s*[A-Za-z_$][\w$]*)?$/.exec(entry);
    if (!match) throw new Error(`${what}: cannot read the ALL_CITIES entry ${JSON.stringify(entry)}`);
    return match[1] ?? match[2] ?? match[3];
  });
}

/** The cities a run can show: registered in the server's and the web app's ALL_CITIES, in the server's order. */
export function configuredCities(files = CITY_CONFIG_FILES) {
  const server = registeredCities(fs.readFileSync(files.server, 'utf8'), files.server);
  const web = new Set(registeredCities(fs.readFileSync(files.web, 'utf8'), files.web));
  return server.filter((id) => web.has(id) && CITY_ID_PATTERN.test(id));
}

const ACTIVE_LINE = /^const ACTIVE_CITY_IDS = new Set\(\[[^\]\n]*\]\);$/gm;

/** The web config's source with `ids` as its active cities; throws unless it has exactly one ACTIVE_CITY_IDS line to change. */
export function withActiveCities(source, ids) {
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string' && CITY_ID_PATTERN.test(id))) {
    throw new Error(`active cities ${JSON.stringify(ids)}: give one or more city ids`);
  }
  const found = source.match(ACTIVE_LINE) ?? [];
  if (found.length !== 1) throw new Error(`the web config has ${found.length} ACTIVE_CITY_IDS lines, expected one: the run cannot choose its city`);
  return source.replace(ACTIVE_LINE, `const ACTIVE_CITY_IDS = new Set(${JSON.stringify(ids)});`);
}

/**
 * A Vite plugin for the run's build: the web config module gets `ids` as its
 * active cities. The build fails if the module never came through, so a run
 * never shows another city than the one it seeded.
 */
export function activeCitiesPlugin(ids, file = CITY_CONFIG_FILES.web) {
  withActiveCities('const ACTIVE_CITY_IDS = new Set([]);', ids); // checks the ids now, not halfway through the build
  const target = fs.realpathSync(file);
  let applied = false;
  return {
    name: 'harness-active-cities',
    enforce: 'pre',
    transform(code, id) {
      const [pathname] = id.split('?');
      if (path.basename(pathname) !== path.basename(target) || !path.isAbsolute(pathname) || !fs.existsSync(pathname)) return null;
      if (fs.realpathSync(pathname) !== target) return null;
      applied = true;
      return { code: withActiveCities(code, ids), map: null };
    },
    buildEnd(error) {
      if (!error && !applied) throw new Error(`the build never loaded ${file}, so the run cannot make ${ids.join(', ')} its active cities`);
    },
  };
}
