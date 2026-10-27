/**
 * Node resolve hook for the harness's server processes: `@city-monitor/shared`
 * and `@city-monitor/shared/schemas.js` load from shared/*.ts (compiled by tsx)
 * instead of shared/dist, so a run never builds into the checkout.
 */

export const SHARED_SOURCES = Object.freeze({
  '@city-monitor/shared': new URL('../../shared/types.ts', import.meta.url).href,
  '@city-monitor/shared/schemas.js': new URL('../../shared/schemas.ts', import.meta.url).href,
});

export async function resolve(specifier, context, nextResolve) {
  const url = SHARED_SOURCES[specifier];
  if (url) return nextResolve(url, context);
  return nextResolve(specifier, context);
}
