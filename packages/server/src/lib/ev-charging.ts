/**
 * Public charging stations from the Bundesnetzagentur's Ladesäulenregister
 * (CC BY 4.0), and Hamburg's live status per charge point (dl-de/by-2.0),
 * merged onto them by EVSE id (.context/ev-charging.md).
 *
 * The register is one national CSV of about 55 MB: `createCsvRecordReader`
 * splits it as it streams in, and `createRegisterCollector` keeps only the rows
 * of the configured cities, grouped into stations.
 */
import type { CityConfig, EvChargingStation, EvLivePoint, EvPlug, EvPointStatus } from '@city-monitor/shared';

type BoundingBox = CityConfig['boundingBox'];

/** The register's landing page; the CSV's file name carries its date, so each run looks it up here. */
export const BNETZA_REGISTER_PAGE = 'https://www.bundesnetzagentur.de/DE/Fachthemen/ElektrizitaetundGas/E-Mobilitaet/Ladesaeulenkarte/start.html';

/** A station as stored: with the station ids of its EVSE ids where a live feed merges on them. */
export type RegisterStation = EvChargingStation & { evse?: string[] };

export interface EvChargingRegister {
  edition: string;
  stations: RegisterStation[];
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function inBox(lat: number, lon: number, box: BoundingBox): boolean {
  return lat >= box.south && lat <= box.north && lon >= box.west && lon <= box.east;
}

// ---------------------------------------------------------------------------
// Finding the newest CSV
// ---------------------------------------------------------------------------

/**
 * The newest register CSV linked from the landing page, with its date
 * (`Ladesaeulenregister_BNetzA_2026-09-01.csv` → 2026-09-01). Null when the
 * page links none. Relative links are resolved against `pageUrl`.
 */
export function findRegisterCsv(html: string, pageUrl: string = BNETZA_REGISTER_PAGE): { url: string; edition: string } | null {
  let best: { url: string; edition: string } | null = null;
  for (const m of html.matchAll(/href="([^"]*Ladesaeulenregister_BNetzA_(\d{4}-\d{2}-\d{2})\.csv[^"]*)"/gi)) {
    const edition = m[2]!;
    if (!best || edition > best.edition) {
      best = { url: new URL(m[1]!.replace(/&amp;/g, '&'), pageUrl).toString(), edition };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Streaming CSV
// ---------------------------------------------------------------------------

/**
 * A ";"-separated CSV split into records as text arrives in chunks. Quoted
 * fields may hold the separator, doubled quotes and line breaks (the register's
 * EVSE ids and public keys often end in one). A trailing CR is dropped.
 */
export function createCsvRecordReader(delimiter = ';') {
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  /** A quote inside a quoted field whose meaning depends on the next character. */
  let quotePending = false;

  function endField(): void {
    row.push(field);
    field = '';
  }

  function push(text: string): string[][] {
    const out: string[][] = [];
    for (let i = 0; i < text.length; i++) {
      const c = text[i]!;
      if (quotePending) {
        quotePending = false;
        if (c === '"') { field += '"'; continue; }
        inQuotes = false;
      }
      if (inQuotes) {
        if (c === '"') quotePending = true;
        else field += c;
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        endField();
      } else if (c === '\n') {
        if (field.endsWith('\r')) field = field.slice(0, -1);
        endField();
        out.push(row);
        row = [];
      } else {
        field += c;
      }
    }
    return out;
  }

  /** The last record when the text does not end in a line break. */
  function end(): string[][] {
    quotePending = false;
    inQuotes = false;
    if (field === '' && row.length === 0) return [];
    if (field.endsWith('\r')) field = field.slice(0, -1);
    endField();
    const last = row;
    row = [];
    return [last];
  }

  return { push, end };
}

// ---------------------------------------------------------------------------
// Register rows → stations
// ---------------------------------------------------------------------------

const COLUMNS = {
  id: 'Ladeeinrichtungs-ID',
  company: 'Betreiber',
  displayName: 'Anzeigename (Karte)',
  status: 'Status',
  kind: 'Art der Ladeeinrichtung',
  points: 'Anzahl Ladepunkte',
  kw: 'Nennleistung Ladeeinrichtung [kW]',
  street: 'Straße',
  number: 'Hausnummer',
  kreis: 'Kreis/kreisfreie Stadt',
  lat: 'Breitengrad',
  lon: 'Längengrad',
} as const;
/** The register lists up to six charge points per device, each with these columns and its number appended. */
const POINT_COLUMNS = ['Steckertypen', 'Nennleistung Stecker', 'EVSE-ID'] as const;
const MAX_POINTS = 6;

type ColumnIndex = Record<keyof typeof COLUMNS, number> & { points_: Array<{ plugs: number; kw: number; evse: number }> };

/** The register's plug spellings ("AC Typ 2 Steckdose", "DC Fahrzeugkupplung Typ Combo 2 (CCS)") → the map's. */
export function registerPlug(spelling: string): EvPlug | null {
  const s = spelling.toLowerCase();
  if (s.includes('ccs') || s.includes('combo')) return 'ccs';
  if (s.includes('chademo')) return 'chademo';
  if (s.includes('megawatt') || s.includes('mcs')) return 'mcs';
  if (s.includes('schuko')) return 'schuko';
  if (s.includes('typ 2') || s.includes('type 2')) return 'type2';
  if (s.includes('typ 1') || s.includes('type 1')) return 'type1';
  return null;
}

const PLUG_ORDER: readonly EvPlug[] = ['ccs', 'chademo', 'mcs', 'type2', 'type1', 'schuko'];
const DC_PLUGS: ReadonlySet<EvPlug> = new Set(['ccs', 'chademo', 'mcs']);

/** "48,442398" → 48.442398; NaN for anything else. */
function germanNumber(s: string | undefined): number {
  const t = (s ?? '').trim();
  return /^-?\d+(,\d+)?$/.test(t) ? Number(t.replace(',', '.')) : NaN;
}

/**
 * The station part of an EVSE id, for matching a live feed: "DE*HHM*E1011*02"
 * → "DE*HHM*E1011". An id of four or more segments ends in the charge point's
 * own number, which goes; a shorter one is kept whole. Upper case, no spaces.
 */
export function evseStation(evse: string): string {
  const id = evse.replace(/\s+/g, '').toUpperCase();
  const parts = id.split('*');
  return parts.length >= 4 ? parts.slice(0, -1).join('*') : id;
}

export interface RegisterTarget {
  cityId: string;
  /** The `Kreis/kreisfreie Stadt` value of the city's rows. */
  kreis: string;
  /** Rows outside it are dropped: a few have coordinates far from their address. */
  box: BoundingBox;
  /** Keep the EVSE station ids, for a city whose live feed merges on them. */
  keepEvse: boolean;
}

interface Building {
  station: EvChargingStation;
  evse: Set<string>;
  plugs: Set<EvPlug>;
}

/**
 * Collects the register's rows for the target cities. Feed it every record of
 * the CSV in order (the preamble before the header row is skipped); `result()`
 * gives each city's stations. Devices in operation (`Status` "In Betrieb") of
 * one operator within about 10 m of each other are one station, with their
 * charge points added up. Throws when the header lacks a column it reads.
 */
export function createRegisterCollector(targets: readonly RegisterTarget[]) {
  const byKreis = new Map(targets.map((t) => [t.kreis, t]));
  const building = new Map(targets.map((t) => [t.cityId, new Map<string, Building>()]));
  let col: ColumnIndex | null = null;
  let rows = 0;

  function header(fields: string[]): ColumnIndex {
    const index = (name: string) => {
      const i = fields.indexOf(name);
      if (i < 0) throw new Error(`Ladesäulenregister header lacks column "${name}"`);
      return i;
    };
    const base = Object.fromEntries(Object.entries(COLUMNS).map(([k, name]) => [k, index(name)])) as Record<keyof typeof COLUMNS, number>;
    const points_ = Array.from({ length: MAX_POINTS }, (_, i) => {
      const [plugs, kw, evse] = POINT_COLUMNS.map((name) => fields.indexOf(`${name}${i + 1}`));
      return { plugs: plugs!, kw: kw!, evse: evse! };
    });
    if (points_[0]!.plugs < 0 || points_[0]!.kw < 0) throw new Error('Ladesäulenregister header lacks the first charge point\'s columns');
    return { ...base, points_ };
  }

  function add(fields: string[]): void {
    if (!col) {
      if (fields[0]?.trim() === COLUMNS.id) col = header(fields.map((f) => f.trim()));
      return;
    }
    if (fields.length < col.lon) return;
    rows++;
    const target = byKreis.get(fields[col.kreis]!.trim());
    if (!target) return;
    if (fields[col.status]!.trim() !== 'In Betrieb') return;
    const lat = germanNumber(fields[col.lat]);
    const lon = germanNumber(fields[col.lon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !inBox(lat, lon, target.box)) return;

    const plugs = new Set<EvPlug>();
    const evse = new Set<string>();
    let maxKw = 0;
    for (const p of col.points_) {
      for (const spelling of (fields[p.plugs] ?? '').split(';')) {
        const plug = registerPlug(spelling.trim());
        if (plug) plugs.add(plug);
      }
      for (const kw of (fields[p.kw] ?? '').split(';')) {
        const n = germanNumber(kw);
        if (n > maxKw) maxKw = n;
      }
      if (target.keepEvse && p.evse >= 0) {
        for (const id of (fields[p.evse] ?? '').split(/[;,\s]+/)) if (id) evse.add(evseStation(id));
      }
    }
    if (maxKw === 0) {
      // No plug power: the device's, which is the sum over its points when they share it
      const kw = germanNumber(fields[col.kw]);
      if (kw > 0) maxKw = kw;
    }
    const points = Math.max(1, Math.round(germanNumber(fields[col.points]) || 1));
    const fast = fields[col.kind]!.trim() === 'Schnellladeeinrichtung' || [...plugs].some((p) => DC_PLUGS.has(p));
    const operator = fields[col.displayName]!.trim() || fields[col.company]!.trim();
    const key = `${operator}|${lat.toFixed(4)}|${lon.toFixed(4)}`;

    const city = building.get(target.cityId)!;
    const existing = city.get(key);
    if (existing) {
      const s = existing.station;
      s.points += points;
      if (maxKw > (s.maxKw ?? 0)) s.maxKw = maxKw;
      s.fast ||= fast;
      for (const p of plugs) existing.plugs.add(p);
      for (const e of evse) existing.evse.add(e);
      return;
    }
    const address = `${fields[col.street]!.trim()} ${fields[col.number]!.trim()}`.trim();
    city.set(key, {
      station: {
        id: fields[col.id]!.trim(),
        lat: round5(lat),
        lon: round5(lon),
        operator,
        address,
        points,
        maxKw: maxKw > 0 ? Math.round(maxKw * 10) / 10 : null,
        fast,
        plugs: [],
      },
      evse,
      plugs,
    });
  }

  /** Each target city's stations; throws when the CSV had no header row (not the register). */
  function result(): Map<string, RegisterStation[]> {
    if (!col) throw new Error('Ladesäulenregister: no header row found');
    const out = new Map<string, RegisterStation[]>();
    for (const t of targets) {
      const stations = [...building.get(t.cityId)!.values()].map(({ station, evse, plugs }): RegisterStation => ({
        ...station,
        plugs: PLUG_ORDER.filter((p) => plugs.has(p)),
        ...(t.keepEvse && evse.size > 0 ? { evse: [...evse].sort() } : {}),
      }));
      out.set(t.cityId, stations);
    }
    return out;
  }

  return { add, result, rowCount: () => rows };
}

// ---------------------------------------------------------------------------
// Hamburg live status (SensorThings API on iot.hamburg.de)
// ---------------------------------------------------------------------------

/** One station of the live feed, with its charge points' status. */
export interface LiveStation {
  /** The station part of the EVSE ids ("DE*HHM*E1011"), as `evseStation` gives it. */
  station: string;
  lat: number;
  lon: number;
  address: string;
  plugs: EvPlug[];
  dc: boolean;
  points: EvLivePoint[];
}

export interface EvChargingStatus {
  stations: LiveStation[];
  /** When the feed was read (ISO 8601). */
  updated: string;
}

/**
 * The SensorThings query for every charge point's status datastream with its
 * station's location and the newest observation. Observations are written when
 * the status changes, so the newest one is the status now.
 */
export function hamburgChargingStatusUrl(baseUrl: string): string {
  const params = new URLSearchParams({
    $filter: "properties/layerName eq 'Status_E-Ladepunkt'",
    $select: 'name,properties/connectorType,properties/current',
    $expand: 'Thing($select=@iot.id;$expand=Locations($select=description,location)),Observations($select=phenomenonTime,result;$top=1;$orderby=phenomenonTime desc)',
    $top: '1000',
  });
  return `${baseUrl}/Datastreams?${params.toString()}`;
}

/** OCPP 1.6 status names, as the feed writes them → the map's four. */
export function ocppStatus(result: unknown): EvPointStatus {
  switch (typeof result === 'string' ? result.toUpperCase() : '') {
    case 'AVAILABLE': return 'available';
    case 'OCCUPIED': case 'PREPARING': case 'CHARGING': case 'SUSPENDEDEV': case 'SUSPENDEDEVSE': case 'FINISHING': case 'RESERVED':
      return 'occupied';
    case 'FAULTED': case 'UNAVAILABLE': return 'outOfOrder';
    default: return 'unknown';
  }
}

/** Hamburg's connector types ("S_TYPE_2", "S_TYPE_2_CEE_7_7", "C_CCS_2") → the map's plugs. */
export function hamburgPlugs(connectorType: unknown): EvPlug[] {
  const s = typeof connectorType === 'string' ? connectorType.toUpperCase() : '';
  const plugs: EvPlug[] = [];
  if (s.includes('CCS')) plugs.push('ccs');
  if (s.includes('CHADEMO')) plugs.push('chademo');
  if (s.includes('TYPE_2')) plugs.push('type2');
  if (s.includes('TYPE_1')) plugs.push('type1');
  if (s.includes('CEE_7_7')) plugs.push('schuko');
  return plugs;
}

interface StaDatastream {
  name?: unknown;
  properties?: { connectorType?: unknown; current?: unknown };
  Thing?: { Locations?: Array<{ description?: unknown; location?: { geometry?: { coordinates?: unknown }; coordinates?: unknown } }> };
  Observations?: Array<{ phenomenonTime?: unknown; result?: unknown }>;
}

/**
 * Charge points from one page of the status query, added to `into` by station
 * (the datastream's name is "Ladepunkt <EVSE id>"). False when the body is not
 * a SensorThings collection. A point without an observation is `unknown`.
 */
export function parseHamburgChargingStatus(json: unknown, box: BoundingBox, into: Map<string, LiveStation>): boolean {
  const streams = (json as { value?: unknown } | null)?.value;
  if (!Array.isArray(streams)) return false;
  for (const d of streams as StaDatastream[]) {
    if (typeof d?.name !== 'string') continue;
    const id = d.name.replace(/^Ladepunkt\s+/i, '').replace(/\s+/g, '').toUpperCase();
    if (!id.includes('*')) continue;
    const obs = d.Observations?.[0];
    let since: number | null = null;
    if (typeof obs?.phenomenonTime === 'string') {
      const at = Date.parse(obs.phenomenonTime.split('/').at(-1)!);
      if (Number.isFinite(at)) since = Math.floor(at / 1000);
    }
    const point: EvLivePoint = { id, status: ocppStatus(obs?.result), since };
    const key = evseStation(id);
    const existing = into.get(key);
    const plugs = hamburgPlugs(d.properties?.connectorType);
    const dc = d.properties?.current === 'DC';
    if (existing) {
      existing.points.push(point);
      for (const p of plugs) if (!existing.plugs.includes(p)) existing.plugs.push(p);
      existing.dc ||= dc;
      continue;
    }
    const loc = d.Thing?.Locations?.[0];
    const coords = loc?.location?.geometry?.coordinates ?? loc?.location?.coordinates;
    if (!Array.isArray(coords)) continue;
    const [lon, lat] = coords as unknown[];
    if (!isNum(lat) || !isNum(lon) || !inBox(lat, lon, box)) continue;
    const description = typeof loc?.description === 'string' ? loc.description : '';
    into.set(key, {
      station: key,
      lat: round5(lat),
      lon: round5(lon),
      // "Eduard-Rhein-Ufer 1, 22078 Hamburg": the street part
      address: description.split(',')[0]!.trim(),
      plugs,
      dc,
      points: [point],
    });
  }
  return true;
}

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/**
 * The stations as the map gets them: the register's, without their EVSE ids,
 * each with the live status of its charge points where the live feed has the
 * station, and the live feed's stations the register lacks added at the end
 * (operator `liveOperator`, power unknown). The cached objects are not changed.
 */
export function mergeEvChargingStatus(
  register: EvChargingRegister,
  status: EvChargingStatus | null,
  liveOperator: string,
): { edition: string; stations: EvChargingStation[]; liveUpdated?: string | null } {
  const stations: EvChargingStation[] = register.stations.map(({ evse: _evse, ...s }) => s);
  if (!status) return { edition: register.edition, stations };

  const byStation = new Map<string, number>();
  register.stations.forEach((s, i) => s.evse?.forEach((e) => byStation.set(e, i)));
  const sortPoints = (points: EvLivePoint[]) => [...points].sort((a, b) => a.id.localeCompare(b.id));
  for (const live of status.stations) {
    const i = byStation.get(live.station);
    if (i !== undefined) {
      stations[i] = { ...stations[i]!, live: sortPoints([...(stations[i]!.live ?? []), ...live.points]) };
      continue;
    }
    stations.push({
      id: `live:${live.station}`,
      lat: live.lat,
      lon: live.lon,
      operator: liveOperator,
      address: live.address,
      points: live.points.length,
      maxKw: null,
      fast: live.dc,
      plugs: PLUG_ORDER.filter((p) => live.plugs.includes(p)),
      live: sortPoints(live.points),
    });
  }
  return { edition: register.edition, stations, liveUpdated: status.updated };
}
