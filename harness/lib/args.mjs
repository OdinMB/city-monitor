/**
 * Command-line parameters of harness/see.mjs, and the steps file. Pure, so
 * every bad input is refused before anything starts.
 */

import { configuredCities, DEFAULT_CITY } from './cities.mjs';
import { GUARD_TESTS } from './guard.mjs';
import { DEFAULT_SCENARIO, SCENARIO_NAMES } from './scenarios.mjs';

export const LANGS = Object.freeze(['de', 'en', 'tr', 'ar']);
export const THEMES = Object.freeze(['light', 'dark']);

const VALUE_OPTIONS = new Set([
  'out', 'city', 'path', 'viewport', 'lang', 'theme', 'seed', 'scenario', 'timeout', 'steps', 'settle', 'timezone',
  'pg-bin', 'pg-user', 'playwright', 'guard-test',
]);
const FLAG_OPTIONS = new Set(['scroll', 'full-page', 'help']);
const REPEATABLE = new Set(['path', 'viewport', 'lang', 'theme']);
const COMMA_LISTS = new Set(['viewport', 'lang', 'theme']);

export const DEFAULTS = Object.freeze({
  city: DEFAULT_CITY,
  /** Without --path: the city's dashboard. */
  paths: [`/${DEFAULT_CITY}`],
  viewports: ['1440x900'],
  langs: ['de'],
  themes: ['light'],
  seed: 1,
  scenario: DEFAULT_SCENARIO,
  timeoutSeconds: 480,
  settleMs: 1500,
  timezone: 'Europe/Berlin',
  pgUser: 'postgres',
});

export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/** A path on the harness's own web server: starts with one slash, names no other host. */
export function checkPagePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return `${JSON.stringify(value)} is not a path on this run's web server (start it with one /)`;
  }
  const url = new URL(value, 'http://127.0.0.1:1');
  if (url.origin !== 'http://127.0.0.1:1') return `${JSON.stringify(value)} leaves this run's web server`;
  return null;
}

/** "390x844" to { width: 390, height: 844 }. */
export function parseViewport(value) {
  const match = /^(\d{2,5})x(\d{2,5})$/.exec(value);
  if (!match) throw new UsageError(`--viewport ${value}: use WIDTHxHEIGHT, e.g. 390x844 or 1440x900`);
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 200 || height < 200 || width > 7680 || height > 7680) {
    throw new UsageError(`--viewport ${value}: width and height must be between 200 and 7680`);
  }
  return { width, height };
}

function positiveInteger(name, value, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^\d+$/.test(value)) throw new UsageError(`--${name} needs a whole number, got ${JSON.stringify(value)}`);
  const n = Number(value);
  if (n < min || n > max) throw new UsageError(`--${name} must be between ${min} and ${max}`);
  return n;
}

/**
 * Parses argv (without node and the script) into the run's parameters.
 * `cities` are the ones --city may name; by default those both packages
 * register (lib/cities.mjs).
 */
export function parseArgs(argv, { cities } = {}) {
  const raw = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) throw new UsageError(`unexpected argument ${JSON.stringify(arg)}`);
    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    let value;
    if (FLAG_OPTIONS.has(name)) {
      if (eq !== -1) throw new UsageError(`--${name} takes no value`);
      value = true;
    } else if (VALUE_OPTIONS.has(name)) {
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        value = argv[i + 1];
        i += 1;
        if (value === undefined || value.startsWith('--')) throw new UsageError(`--${name} needs a value`);
      }
    } else {
      throw new UsageError(`unknown option --${name}`);
    }
    if (REPEATABLE.has(name)) {
      const parts = COMMA_LISTS.has(name) ? value.split(',').map((s) => s.trim()).filter(Boolean) : [value];
      raw[name] = [...(raw[name] ?? []), ...parts];
    } else {
      if (name in raw) throw new UsageError(`--${name} given twice`);
      raw[name] = value;
    }
  }

  if (raw.help) return { help: true };
  if (!raw.out) throw new UsageError('--out <folder> is required: the run writes only under it');

  const city = raw.city ?? DEFAULTS.city;
  const known = cities ?? configuredCities();
  if (!known.includes(city)) {
    throw new UsageError(`--city ${city}: use one of ${known.join(', ')} (the cities packages/server and packages/web both register in ALL_CITIES)`);
  }
  const paths = raw.path ?? [`/${city}`];
  for (const p of paths) {
    const problem = checkPagePath(p);
    if (problem) throw new UsageError(`--path ${problem}`);
  }
  const viewports = (raw.viewport ?? DEFAULTS.viewports).map(parseViewport);
  const langs = raw.lang ?? DEFAULTS.langs;
  for (const lang of langs) if (!LANGS.includes(lang)) throw new UsageError(`--lang ${lang}: use one of ${LANGS.join(', ')}`);
  const themes = raw.theme ?? DEFAULTS.themes;
  for (const theme of themes) if (!THEMES.includes(theme)) throw new UsageError(`--theme ${theme}: use light or dark`);

  const seed = raw.seed === undefined ? DEFAULTS.seed : positiveInteger('seed', raw.seed, { min: 0, max: 2 ** 31 - 1 });
  const scenario = raw.scenario ?? DEFAULTS.scenario;
  if (!SCENARIO_NAMES.includes(scenario)) throw new UsageError(`--scenario ${scenario}: use one of ${SCENARIO_NAMES.join(', ')}`);
  const timeoutSeconds = raw.timeout === undefined ? DEFAULTS.timeoutSeconds : positiveInteger('timeout', raw.timeout, { min: 30, max: 3600 });
  const settleMs = raw.settle === undefined ? DEFAULTS.settleMs : positiveInteger('settle', raw.settle, { min: 0, max: 60_000 });

  const timezone = raw.timezone ?? DEFAULTS.timezone;
  if (!/^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(timezone)) throw new UsageError(`--timezone ${timezone}: use an IANA name such as Europe/Berlin`);

  const pgUser = raw['pg-user'] ?? DEFAULTS.pgUser;
  if (!/^[a-z_][a-z0-9_-]*$/.test(pgUser)) throw new UsageError(`--pg-user ${pgUser}: not a system user name`);

  const guardTest = raw['guard-test'];
  if (guardTest !== undefined && !GUARD_TESTS.includes(guardTest)) {
    throw new UsageError(`--guard-test=${guardTest}: use one of ${GUARD_TESTS.join(', ')}`);
  }

  return {
    help: false,
    out: raw.out,
    city,
    paths,
    viewports,
    langs,
    themes,
    seed,
    scenario,
    scroll: raw.scroll === true,
    fullPage: raw['full-page'] === true,
    timeoutSeconds,
    settleMs,
    timezone,
    stepsFile: raw.steps,
    pgBin: raw['pg-bin'],
    pgUser,
    playwright: raw.playwright,
    guardTest,
  };
}

export const STEP_ACTIONS = Object.freeze(['click', 'tap', 'hover', 'wait', 'scroll-to', 'press', 'screenshot', 'goto']);
const LOCATOR_ACTIONS = new Set(['click', 'tap', 'hover', 'scroll-to']);

/**
 * Validates a steps file's parsed JSON: an array of
 * { action, selector? | text?, nth?, ms?, key?, path?, name?, position? }.
 * Returns the steps, or throws a UsageError naming the first bad one.
 */
export function validateSteps(parsed) {
  if (!Array.isArray(parsed)) throw new UsageError('the steps file must hold a JSON array of steps');
  const names = new Set();
  return parsed.map((step, index) => {
    const where = `step ${index + 1}`;
    if (!step || typeof step !== 'object' || Array.isArray(step)) throw new UsageError(`${where} must be an object`);
    const { action } = step;
    if (!STEP_ACTIONS.includes(action)) throw new UsageError(`${where}: action must be one of ${STEP_ACTIONS.join(', ')}`);
    const allowed = new Set(['action', 'selector', 'text', 'exact', 'nth', 'ms', 'key', 'path', 'name', 'position', 'timeout']);
    for (const key of Object.keys(step)) if (!allowed.has(key)) throw new UsageError(`${where}: unknown field ${key}`);
    if (step.selector !== undefined && typeof step.selector !== 'string') throw new UsageError(`${where}: selector must be a string`);
    if (step.text !== undefined && typeof step.text !== 'string') throw new UsageError(`${where}: text must be a string`);
    if (step.selector !== undefined && step.text !== undefined) throw new UsageError(`${where}: give selector or text, not both`);
    if (step.nth !== undefined && !(Number.isInteger(step.nth) && step.nth >= 0)) throw new UsageError(`${where}: nth must be a whole number`);
    if (step.timeout !== undefined && !(Number.isInteger(step.timeout) && step.timeout > 0 && step.timeout <= 120_000)) {
      throw new UsageError(`${where}: timeout must be milliseconds between 1 and 120000`);
    }
    const hasLocator = step.selector !== undefined || step.text !== undefined;
    if (LOCATOR_ACTIONS.has(action) && !hasLocator && !(action === 'scroll-to' && step.position !== undefined)) {
      throw new UsageError(`${where}: ${action} needs a selector or text${action === 'scroll-to' ? ' (or position top|bottom)' : ''}`);
    }
    if (step.position !== undefined && !(action === 'scroll-to' && ['top', 'bottom'].includes(step.position))) {
      throw new UsageError(`${where}: position is top or bottom, on scroll-to only`);
    }
    if (action === 'wait' && !hasLocator && !(Number.isInteger(step.ms) && step.ms >= 0 && step.ms <= 60_000)) {
      throw new UsageError(`${where}: wait needs ms (0 to 60000) or a selector or text to wait for`);
    }
    if (action === 'press' && (typeof step.key !== 'string' || !step.key)) throw new UsageError(`${where}: press needs a key, e.g. Escape`);
    if (action === 'goto') {
      const problem = checkPagePath(step.path);
      if (problem) throw new UsageError(`${where}: goto path ${problem}`);
    }
    if (action === 'screenshot') {
      if (typeof step.name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(step.name)) {
        throw new UsageError(`${where}: screenshot needs a name of letters, digits, - and _ (at most 60)`);
      }
      if (names.has(step.name)) throw new UsageError(`${where}: screenshot name ${step.name} is used twice`);
      names.add(step.name);
    }
    return { ...step };
  });
}

export const USAGE = `Usage: node harness/see.mjs --out <folder> [options]

Starts its own Postgres, seeds it with synthetic data, serves the API and
the web app on 127.0.0.1 and screenshots pages in headless Chromium. Every
request off this machine is blocked. See harness/README.md.

  --out <folder>          required; each run writes only under <folder>/<run id>
  --city <id>             the city seeded, served and built for (default berlin)
  --path <path>           page to open, repeatable (default /<city>)
  --viewport <WxH>        repeatable or comma-separated (default 1440x900)
  --lang <de|en|tr|ar>    repeatable or comma-separated (default de)
  --theme <light|dark>    repeatable or comma-separated (default light)
  --seed <n>              synthetic data set (default 1)
  --scenario <name>       data state: ${SCENARIO_NAMES.join(' | ')} (default ${DEFAULT_SCENARIO})
  --scroll                scroll each page to the bottom first, so lazy tiles load
  --full-page             screenshot the whole page, not only the viewport
  --steps <file.json>     steps to run on each page after it loads
  --settle <ms>           wait after load and after each step (default 1500)
  --timezone <name>       the browser's time zone (default Europe/Berlin)
  --timeout <seconds>     stop everything after this long (default 480)
  --pg-bin <dir>          folder holding initdb and postgres
  --pg-user <name>        as root: the user Postgres runs as (default postgres)
  --playwright <dir>      the Playwright package folder
  --guard-test=<case>     negative test: env | target | target-loopback | network
  --help`;
