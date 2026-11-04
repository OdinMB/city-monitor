import { decodeJson, encodeJson } from './compact-json.js';
import { compactNamed, parseNamed } from './setup-codec.js';
import { compactMapState, parseMapState } from './map-state.js';
import type { SharedSetup } from './setup-state.js';
import type { MapState } from '../hooks/useCommandCenter.js';

/**
 * A link to a city's dashboard with the setup shown and the map state in it:
 * `setup=functional|topics`, or `setup=c.<compact setup, its name included>`,
 * and `map=<compact map state>`. The dashboard previews them and then takes
 * them out of the address (hooks/useSetupSession.ts).
 */

const SETUP = 'setup';
const MAP = 'map';
const CUSTOM_PREFIX = 'c.';

export interface SharedParams {
  setup: SharedSetup | null;
  map: Partial<MapState> | null;
}

function setupParam(setup: SharedSetup): string {
  return typeof setup === 'string' ? setup : CUSTOM_PREFIX + encodeJson(compactNamed(setup));
}

function parseSetupParam(value: string | null): SharedSetup | null {
  if (value === 'functional' || value === 'topics') return value;
  if (!value?.startsWith(CUSTOM_PREFIX)) return null;
  return parseNamed(decodeJson(value.slice(CUSTOM_PREFIX.length)));
}

export function shareUrl(origin: string, cityId: string, setup: SharedSetup, map: MapState): string {
  const params = new URLSearchParams({ [SETUP]: setupParam(setup), [MAP]: encodeJson(compactMapState(map)) });
  return `${origin}/${cityId}?${params.toString()}`;
}

/** The setup and map state a link carries; each is null when absent or malformed. */
export function readSharedParams(search: string): SharedParams {
  const params = new URLSearchParams(search);
  const map = params.get(MAP);
  return { setup: parseSetupParam(params.get(SETUP)), map: map ? parseMapState(decodeJson(map)) : null };
}

/** The query string without the setup and map parameters, other parameters kept. */
export function withoutSharedParams(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(SETUP);
  params.delete(MAP);
  const rest = params.toString();
  return rest ? `?${rest}` : '';
}

export function hasSharedParams(search: string): boolean {
  const params = new URLSearchParams(search);
  return params.has(SETUP) || params.has(MAP);
}
