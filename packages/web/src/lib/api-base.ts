/**
 * Where the web app reaches the API. Pure functions, so `vite.config.ts` can
 * use them at build time as well as `lib/api.ts` in the browser.
 *
 * Unset, the base is '/api' on the page's own origin: the Vite dev proxy
 * locally. A production build sets VITE_API_BASE to the API's own address
 * (render.yaml), and the browser then calls it cross-origin, which the API
 * allows through CORS (ALLOWED_ORIGINS).
 */

/** VITE_API_BASE without trailing slashes, or '/api' when it is unset or blank. */
export function resolveApiBase(raw: string | undefined): string {
  const value = raw?.trim().replace(/\/+$/, '');
  return value ? value : '/api';
}

/** The origin an absolute base points at, or null for a path on the page's own origin. */
export function apiOrigin(base: string): string | null {
  return /^https?:\/\//i.test(base) ? new URL(base).origin : null;
}
