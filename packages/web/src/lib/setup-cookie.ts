import { decodeJson, encodeJson } from './compact-json.js';
import { compactView, parseView } from './setup-codec.js';
import { withSetupMap, type SetupView } from './setup-state.js';
import type { PresetId } from './tile-setups.js';

/**
 * The one cookie the site sets: the visitor's own display preferences per
 * city (the setup shown, their own setups with their maps, collapsed
 * sections, their changes to the presets' maps), first party, never sent
 * anywhere but back to the site. Versioned (`v: 3`); a value of another
 * version (v2 kept one map per city), shape or size is ignored. Written only
 * after the visitor changes something (hooks/useSetupSession.ts). The privacy
 * page lists it.
 *
 * Browsers that block site data throw on `document.cookie`, so each access
 * sits in its own try/catch, as with localStorage (frontend.md → Browser Storage).
 */

const SETUP_COOKIE_NAME = 'cm_setup';
export const SETUP_COOKIE = SETUP_COOKIE_NAME;

/** Well under the 4 KB browsers allow per cookie, name and value together. */
export const MAX_COOKIE_LENGTH = 3800;
const MAX_AGE = 365 * 24 * 60 * 60;
const VERSION = 3;
const CITY_KEY = /^[a-z][a-z0-9-]{0,31}$/;

export interface CityPrefs {
  view: SetupView;
  /** When the visitor last changed something in this city (seconds); the size guard drops the oldest first. */
  touched: number;
}

export type SetupPrefs = Record<string, CityPrefs>;

function encodeAll(prefs: SetupPrefs): string {
  const cities: Record<string, unknown> = {};
  for (const [city, entry] of Object.entries(prefs)) cities[city] = { ...compactView(entry.view), u: entry.touched };
  return encodeJson({ v: VERSION, c: cities });
}

const fitting = (value: string) => `${SETUP_COOKIE_NAME}=${value}`.length <= MAX_COOKIE_LENGTH;

function withoutPresetMap(prefs: SetupPrefs, city: string, preset: PresetId): SetupPrefs {
  return { ...prefs, [city]: { ...prefs[city], view: withSetupMap(prefs[city].view, preset, {}, 0) } };
}

/**
 * The cookie value. What does not fit goes in this order: the changes to the
 * presets' maps, made longest ago first, in any city; then the cities touched
 * longest ago. A city's own setups always fit (setup-cookie.test.ts). Null
 * when no city is left.
 */
export function encodePrefs(prefs: SetupPrefs): string | null {
  if (Object.keys(prefs).length === 0) return null;
  let kept = prefs;
  const presetMaps = Object.entries(prefs)
    .flatMap(([city, entry]) => Object.entries(entry.view.presetMaps).map(([preset, change]) => ({ city, preset: preset as PresetId, touched: change?.touched ?? 0 })))
    .sort((a, b) => a.touched - b.touched);
  for (let dropped = 0; dropped <= presetMaps.length; dropped++) {
    if (dropped > 0) kept = withoutPresetMap(kept, presetMaps[dropped - 1].city, presetMaps[dropped - 1].preset);
    const value = encodeAll(kept);
    if (fitting(value)) return value;
  }
  const oldestFirst = Object.keys(kept).sort((a, b) => kept[a].touched - kept[b].touched);
  for (let dropped = 1; dropped < oldestFirst.length; dropped++) {
    const value = encodeAll(Object.fromEntries(oldestFirst.slice(dropped).map((city) => [city, kept[city]])));
    if (fitting(value)) return value;
  }
  return null;
}

function parseCity(raw: unknown): CityPrefs | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { u } = raw as Record<string, unknown>;
  if (typeof u !== 'number' || !Number.isFinite(u) || u < 0) return null;
  return { view: parseView(raw), touched: u };
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

/**
 * Writes the preferences, the cities touched longest ago dropped as needed.
 * Should even the newest city not fit on its own (names longer than the caps
 * allow), the cookie stays as it was: that change goes unsaved, nothing is lost.
 */
export function writePrefs(prefs: SetupPrefs): void {
  const value = encodePrefs(prefs);
  if (value === null) return;
  try {
    document.cookie = cookieString(value, window.location.protocol === 'https:');
  } catch {
    // Cookies blocked: the setup holds for this visit only.
  }
}
