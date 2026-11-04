import { decodeJson, encodeJson } from './compact-json.js';
import { compactView, parseView, type SetupView } from './setup-state.js';
import { compactMapState, parseMapState } from './map-state.js';
import type { MapState } from '../hooks/useCommandCenter.js';

/**
 * The one cookie the site sets: the visitor's own display preferences per
 * city (tile setup, collapsed sections, map state), first party, never sent
 * anywhere but back to the site. Versioned (`v: 1`); a value of another
 * version, shape or size is ignored. Written only after the visitor changes
 * something (hooks/useSetupSession.ts). The privacy page lists it.
 *
 * Browsers that block site data throw on `document.cookie`, so each access
 * sits in its own try/catch, as with localStorage (frontend.md → Browser Storage).
 */

const SETUP_COOKIE_NAME = 'cm_setup';
export const SETUP_COOKIE = SETUP_COOKIE_NAME;

/** Well under the 4 KB browsers allow per cookie, name and value together. */
export const MAX_COOKIE_LENGTH = 3800;
const MAX_AGE = 365 * 24 * 60 * 60;
const VERSION = 1;
const CITY_KEY = /^[a-z][a-z0-9-]{0,31}$/;

export interface CityPrefs {
  view: SetupView;
  /** The map state, once the visitor changed the map or kept a shared one. */
  map?: Partial<MapState>;
  /** When the visitor last changed something in this city (seconds); the size guard drops the oldest first. */
  touched: number;
}

export type SetupPrefs = Record<string, CityPrefs>;

function encodeAll(prefs: SetupPrefs): string {
  const cities: Record<string, unknown> = {};
  for (const [city, entry] of Object.entries(prefs)) {
    cities[city] = { ...compactView(entry.view), ...(entry.map ? { m: compactMapState(entry.map) } : {}), u: entry.touched };
  }
  return encodeJson({ v: VERSION, c: cities });
}

/** The cookie value, cities touched longest ago dropped until it fits; null when no city is left. */
export function encodePrefs(prefs: SetupPrefs): string | null {
  const oldestFirst = Object.keys(prefs).sort((a, b) => prefs[a].touched - prefs[b].touched);
  for (let dropped = 0; dropped < oldestFirst.length; dropped++) {
    const kept = oldestFirst.slice(dropped);
    const value = encodeAll(Object.fromEntries(kept.map((city) => [city, prefs[city]])));
    if (`${SETUP_COOKIE_NAME}=${value}`.length <= MAX_COOKIE_LENGTH) return value;
  }
  return null;
}

function parseCity(raw: unknown): CityPrefs | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { m, u } = raw as Record<string, unknown>;
  if (typeof u !== 'number' || !Number.isFinite(u) || u < 0) return null;
  const map = parseMapState(m);
  return { view: parseView(raw), ...(map ? { map } : {}), touched: u };
}

/** The preferences in a cookie value; none for a value this version did not write. */
export function decodePrefs(value: string | undefined): SetupPrefs {
  if (!value || value.length > MAX_COOKIE_LENGTH) return {};
  const doc = decodeJson(value);
  if (typeof doc !== 'object' || doc === null) return {};
  const { v, c } = doc as Record<string, unknown>;
  if (v !== VERSION || typeof c !== 'object' || c === null || Array.isArray(c)) return {};
  const prefs: SetupPrefs = {};
  for (const [city, raw] of Object.entries(c)) {
    const entry = CITY_KEY.test(city) ? parseCity(raw) : null;
    if (entry) prefs[city] = entry;
  }
  return prefs;
}

/** The `document.cookie` assignment for a value; null deletes the cookie. */
export function cookieString(value: string | null, secure: boolean): string {
  if (value === null) return `${SETUP_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  return `${SETUP_COOKIE_NAME}=${value}; path=/; max-age=${MAX_AGE}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function readPrefs(): SetupPrefs {
  let cookies = '';
  try {
    cookies = document.cookie;
  } catch {
    return {};
  }
  const pair = cookies.split('; ').find((c) => c.startsWith(`${SETUP_COOKIE_NAME}=`));
  return decodePrefs(pair?.slice(SETUP_COOKIE_NAME.length + 1));
}

export function writePrefs(prefs: SetupPrefs): void {
  try {
    document.cookie = cookieString(encodePrefs(prefs), window.location.protocol === 'https:');
  } catch {
    // Cookies blocked: the setup holds for this visit only.
  }
}
