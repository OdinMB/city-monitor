/** Sub-pages every city has (the `/:cityId/<page>` routes in App.tsx). */
const CITY_SUBPAGES = new Set(['sources']);

/**
 * Where switching to `cityId` leads from `pathname`: the same sub-page of that
 * city when every city has it, otherwise its dashboard.
 */
export function citySwitchPath(pathname: string, cityId: string): string {
  const segments = pathname.split('/').filter(Boolean);
  const page = segments.length === 2 ? (segments[1] ?? '') : '';
  return CITY_SUBPAGES.has(page) ? `/${cityId}/${page}` : `/${cityId}`;
}
