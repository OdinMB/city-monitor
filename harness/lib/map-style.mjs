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
 */

const STYLE_HOST = 'basemaps.cartocdn.com';
const STYLE_PATH = /^\/gl\/([a-z0-9-]+)\/style\.json$/;

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
 * the request has no local answer and is blocked.
 */
export function localResponse(url) {
  const name = baseMapStyleName(url);
  if (name === null) return null;
  const { host, pathname } = new URL(url);
  return {
    key: `${host}${pathname}`,
    fulfil: {
      status: 200,
      contentType: 'application/json; charset=utf-8',
      // The app fetches it from its own origin, so the answer must allow that origin.
      headers: { 'access-control-allow-origin': '*', 'cache-control': 'no-store' },
      body: JSON.stringify(localMapStyle(name)),
    },
  };
}
