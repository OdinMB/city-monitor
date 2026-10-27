/**
 * The base map, answered inside the browser. The app fetches its MapLibre
 * style from basemaps.cartocdn.com and creates no map until that arrives;
 * the browser's routes answer that one request with the style built here,
 * from memory, and never send it.
 *
 * The style is a background in the theme's colour and nothing else:
 * - no sources, so MapLibre asks for no tiles;
 * - no sprite, since the app registers its own marker images;
 * - no glyphs URL, so MapLibre draws label text itself from the browser's
 *   local fonts (its GlyphManager falls back to TinySDF when a style has
 *   no glyphs URL).
 * Its one layer keeps the id `background`, which the app leaves visible.
 *
 * --map-style can make that answer fail instead (MAP_STYLES): the browser
 * still answers from memory and sends nothing, with an error status and no
 * style, as the CDN would during an outage.
 */

const STYLE_HOST = 'basemaps.cartocdn.com';
const STYLE_PATH = /^\/gl\/([a-z0-9-]+)\/style\.json$/;

/** How the browser answers the base map's style (--map-style), and what each lets you see. */
export const MAP_STYLES = Object.freeze({
  local: 'the local stand-in, so the map draws its layers',
  fail: 'every base-map style request fails with 503, so the map never loads',
  'fail-once': 'the first base-map style request of each page fails with 503, later ones get the stand-in, so a retry loads the map',
});
export const MAP_STYLE_NAMES = Object.freeze(Object.keys(MAP_STYLES));
export const DEFAULT_MAP_STYLE = 'local';
/** The status a failing style answer carries. */
export const STYLE_FAILURE_STATUS = 503;

/**
 * Whether the next base-map style request fails under `mode`, after
 * `answered` earlier style requests in the same browser context.
 */
export function styleFails(mode, answered) {
  if (!Object.hasOwn(MAP_STYLES, mode)) throw new Error(`unknown map style ${mode}: use one of ${MAP_STYLE_NAMES.join(', ')}`);
  return mode === 'fail' || (mode === 'fail-once' && answered === 0);
}

/** Background colours of the stand-in, close to the base map's own. */
export const BACKGROUND = Object.freeze({ light: '#fafaf8', dark: '#0e0e0e' });

/**
 * The style name in a base-map style URL (`https://basemaps.cartocdn.com/gl/<name>/style.json`),
 * or null for any other URL, tiles, fonts and sprites on the same hosts included.
 */
export function baseMapStyleName(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.host !== STYLE_HOST || parsed.username || parsed.password) return null;
  const match = STYLE_PATH.exec(parsed.pathname);
  return match ? match[1] : null;
}

/** The theme a base-map style stands for: CARTO's dark styles are named dark-matter. */
export function styleTheme(name) {
  return name.startsWith('dark-matter') ? 'dark' : 'light';
}

/** The stand-in for the named base-map style. */
export function localMapStyle(name) {
  return {
    version: 8,
    name: `local stand-in for ${name}`,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': BACKGROUND[styleTheme(name)] } }],
  };
}

/**
 * What the browser answers `url` with without sending it, as options for
 * Playwright's `route.fulfill`, plus the `key` it is counted under; null when
 * the request has no local answer and is blocked. With `fail`, a base-map
 * style gets an error status and no style, counted under its own key.
 */
export function localResponse(url, { fail = false } = {}) {
  const name = baseMapStyleName(url);
  if (name === null) return null;
  const { host, pathname } = new URL(url);
  // The app fetches it from its own origin, so the answer must allow that origin.
  const headers = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
  if (fail) {
    return {
      key: `${host}${pathname} as ${STYLE_FAILURE_STATUS}`,
      fulfil: { status: STYLE_FAILURE_STATUS, contentType: 'text/plain; charset=utf-8', headers, body: 'base-map style unavailable (local answer, --map-style)' },
    };
  }
  return {
    key: `${host}${pathname}`,
    fulfil: {
      status: 200,
      contentType: 'application/json; charset=utf-8',
      headers,
      body: JSON.stringify(localMapStyle(name)),
    },
  };
}
