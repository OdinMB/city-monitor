/**
 * One parser per `dataSources.bikeSharing.provider` (.context/bike-sharing.md).
 * Each turns the provider's answer into stations inside the city's bounding
 * box, with bikes available and, where the station has fixed docks, free
 * docks. Free-floating bikes are left out.
 */
import type { BikeStation, CityConfig } from '@city-monitor/shared';

type BoundingBox = CityConfig['boundingBox'];

/** About a metre: enough for a map marker, and shorter than the feeds' six or more decimals. */
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

function inBox(lat: number, lon: number, box: BoundingBox): boolean {
  return lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// GBFS 2.x (nextbike: Berlin, KVB-Rad Köln, MyRadl München)
// ---------------------------------------------------------------------------

/**
 * The station_information and station_status URLs from a GBFS auto-discovery
 * file (`gbfs.json`), in German where the system offers it, else its first
 * language. Null when either feed is missing.
 */
export function gbfsFeedUrls(json: unknown): { info: string; status: string } | null {
  const data = (json as { data?: Record<string, { feeds?: Array<{ name?: unknown; url?: unknown }> }> } | null)?.data;
  if (!data || typeof data !== 'object') return null;
  const lang = data.de ?? Object.values(data)[0];
  const feeds = Array.isArray(lang?.feeds) ? lang.feeds : [];
  const url = (name: string) => {
    const f = feeds.find((x) => x.name === name);
    return typeof f?.url === 'string' ? f.url : null;
  };
  const info = url('station_information');
  const status = url('station_status');
  return info && status ? { info, status } : null;
}

interface GbfsStationInfo {
  station_id?: unknown;
  name?: unknown;
  lat?: unknown;
  lon?: unknown;
  capacity?: unknown;
  is_virtual_station?: unknown;
}

interface GbfsStationStatus {
  station_id?: unknown;
  num_bikes_available?: unknown;
  num_docks_available?: unknown;
  is_installed?: unknown;
  is_renting?: unknown;
  last_reported?: unknown;
}

/**
 * Stations from a GBFS station_information and station_status pair. A station
 * counts when it is inside `box`, installed and renting. Free docks are given
 * only where the station has a capacity and is not virtual: nextbike reports 0
 * docks at its virtual (dockless) stations. Null when either body is not GBFS.
 */
export function parseGbfsStations(
  infoJson: unknown,
  statusJson: unknown,
  box: BoundingBox,
): { stations: BikeStation[]; updated: string | null } | null {
  const infos = (infoJson as { data?: { stations?: unknown } } | null)?.data?.stations;
  const statuses = (statusJson as { data?: { stations?: unknown } } | null)?.data?.stations;
  if (!Array.isArray(infos) || !Array.isArray(statuses)) return null;

  const statusById = new Map<string, GbfsStationStatus>();
  for (const s of statuses as GbfsStationStatus[]) {
    if (s && (typeof s.station_id === 'string' || isNum(s.station_id))) statusById.set(String(s.station_id), s);
  }

  const stations: BikeStation[] = [];
  for (const i of infos as GbfsStationInfo[]) {
    if (!i || (typeof i.station_id !== 'string' && !isNum(i.station_id))) continue;
    const id = String(i.station_id);
    const s = statusById.get(id);
    if (!s) continue;
    if (!isNum(i.lat) || !isNum(i.lon) || !inBox(i.lat, i.lon, box)) continue;
    if (s.is_installed === false || s.is_renting === false) continue;
    if (!isNum(s.num_bikes_available)) continue;
    const hasDocks = i.is_virtual_station !== true && isNum(i.capacity) && i.capacity > 0;
    stations.push({
      id,
      name: typeof i.name === 'string' ? i.name.trim() : id,
      lat: round5(i.lat),
      lon: round5(i.lon),
      bikes: Math.max(0, s.num_bikes_available),
      docks: hasDocks && isNum(s.num_docks_available) ? Math.max(0, s.num_docks_available) : null,
      reportedAt: isNum(s.last_reported) ? s.last_reported : null,
    });
  }

  const lastUpdated = (statusJson as { last_updated?: unknown }).last_updated;
  const updated = isNum(lastUpdated) ? new Date(lastUpdated * 1000).toISOString() : null;
  return { stations, updated };
}

// ---------------------------------------------------------------------------
// Hamburg StadtRAD (SensorThings API on iot.hamburg.de)
// ---------------------------------------------------------------------------

/**
 * A station whose count has not changed for this long is left out: the API
 * keeps things for stations that have closed (one last changed in May 2025),
 * and a count that stood still for a month is no longer a live reading.
 */
export const STADTRAD_MAX_SILENCE_MS = 30 * 86_400_000;

/**
 * The SensorThings query for every StadtRAD station with its location and the
 * newest observation of its "Fahrraeder" datastream (bikes available). Older
 * things also carry a retired datastream without a layer name, which the
 * inner filter leaves out.
 */
export function stadtradThingsUrl(baseUrl: string): string {
  const params = new URLSearchParams({
    $filter: "Datastreams/properties/serviceName eq 'HH_STA_StadtRad'",
    $select: '@iot.id,description',
    $expand: "Locations($select=location),Datastreams($filter=properties/layerName eq 'Fahrraeder';$select=@iot.id;$expand=Observations($select=phenomenonTime,result;$top=1;$orderby=phenomenonTime desc))",
    $top: '1000',
  });
  return `${baseUrl}/Things?${params.toString()}`;
}

interface StaThing {
  '@iot.id'?: unknown;
  description?: unknown;
  Locations?: Array<{ location?: { geometry?: { coordinates?: unknown }; coordinates?: unknown } }>;
  Datastreams?: Array<{ Observations?: Array<{ phenomenonTime?: unknown; result?: unknown }> }>;
}

/**
 * Stations from one page of the StadtRAD Things query (`value`), with the
 * newest observation time among them. Null when the body is not a
 * SensorThings collection. StadtRAD has no docks, so `docks` is null.
 */
export function parseStadtradThings(
  json: unknown,
  box: BoundingBox,
  now: number,
): { stations: BikeStation[]; newest: number | null } | null {
  const things = (json as { value?: unknown } | null)?.value;
  if (!Array.isArray(things)) return null;
  const stations: BikeStation[] = [];
  let newest: number | null = null;
  for (const t of things as StaThing[]) {
    const id = t?.['@iot.id'];
    if (!isNum(id) && typeof id !== 'string') continue;
    const loc = t.Locations?.[0]?.location;
    // A Location is a GeoJSON Feature here; a bare geometry is valid SensorThings too
    const coords = loc?.geometry?.coordinates ?? loc?.coordinates;
    if (!Array.isArray(coords)) continue;
    const [lon, lat] = coords as unknown[];
    if (!isNum(lat) || !isNum(lon) || !inBox(lat, lon, box)) continue;
    const obs = t.Datastreams?.[0]?.Observations?.[0];
    if (!obs || !isNum(obs.result) || typeof obs.phenomenonTime !== 'string') continue;
    // phenomenonTime may be an interval ("start/end"); its end is when the count was taken
    const at = Date.parse(obs.phenomenonTime.split('/').at(-1)!);
    if (!Number.isFinite(at) || now - at > STADTRAD_MAX_SILENCE_MS) continue;
    const description = typeof t.description === 'string' ? t.description : '';
    stations.push({
      id: String(id),
      name: description.replace(/^StadtRad-Station\s+/i, '').trim() || String(id),
      lat: round5(lat),
      lon: round5(lon),
      bikes: Math.max(0, obs.result),
      docks: null,
      reportedAt: Math.floor(at / 1000),
    });
    if (newest === null || at > newest) newest = at;
  }
  return { stations, newest };
}
