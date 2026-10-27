/**
 * Named data states for a run (--scenario). Each one is a fixed change to
 * the synthetic seed's snapshot rows, made in the run's own Postgres after
 * the seed and before the API starts (lib/product-child.mjs), so the API and
 * the web app read it like any other data.
 *
 * The API serves the newest snapshot row of each type, with its fetched_at
 * as `fetchedAt` (loadSnapshot in packages/server/src/db/reads.ts), and the
 * web app calls a tile stale once that is older than staleAfter() in
 * packages/web/src/lib/freshness.ts. The shapes are the ones the API serves:
 * - weather alerts as the DWD ingestion writes them, an open-ended warning
 *   with an empty validUntil;
 * - NINA warnings as the NINA ingestion writes them;
 * - an empty list, fetched now, where an ingestion run found nothing. The
 *   NINA ingestion stores that list as a row; the transit ingestion keeps it
 *   in the cache rather than writing it. Synthetic mode runs no ingestion and
 *   warms the cache from the database, so a row holding the empty list makes
 *   the API answer the same.
 *
 * A scenario runs on one city's rows, given as its place: the city's centre
 * and the snapshot types its seed holds (scenarioPlace). A change to a type
 * the city has no data for at all (Hamburg has no transit source) is left
 * out, so its tile stays as production shows it for that city.
 *
 * planScenario is pure: the same rows, place and `now` give the same result,
 * and nothing is random.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MARK = '[Synthetisch]';

/** The snapshot types the scenarios change (SNAPSHOT_TYPES in packages/server/src/db/schema.ts). */
export const SNAPSHOT = Object.freeze({
  weather: 'open-meteo',
  transit: 'vbb-disruptions',
  nina: 'bbk-nina',
  waterLevels: 'pegelonline',
});

/** How old the outage scenario's data is. */
export const OUTAGE_AGE = Object.freeze({ transit: 4 * HOUR, weather: 6 * HOUR });

// One change to the rows of one snapshot type.
/** The newest row's data becomes patch(data); its fetched_at stays. */
const patchLatest = (type, patch) => ({ kind: 'patch-latest', type, patch });
/** Every row goes, and one row holding `data`, fetched now, takes their place. */
const put = (type, data) => ({ kind: 'put', type, data });
/** The newest row was fetched `ageMs` before now, and every row fetched since then is gone. */
const backdate = (type, ageMs) => ({ kind: 'backdate', type, ageMs });
/** Every row goes: nothing was ever fetched. */
const remove = (type) => ({ kind: 'remove', type });

const iso = (ms) => new Date(ms).toISOString();

/**
 * Five DWD warnings, deliberately not in severity order: one each at
 * moderate, severe and extreme, one with no end (empty validUntil) and one
 * that ended an hour before `now`.
 */
export function stormAlerts(now) {
  const description = 'Synthetische Wetterwarnung für die lokale Entwicklung. Es besteht keine Gefahr.';
  return [
    { headline: `${MARK} Amtliche UNWETTERWARNUNG vor ORKANBÖEN`, severity: 'severe', description, validUntil: iso(now + 3 * HOUR) },
    { headline: `${MARK} Amtliche WARNUNG vor STURMBÖEN`, severity: 'moderate', description, validUntil: iso(now + 6 * HOUR) },
    { headline: `${MARK} Amtliche WARNUNG vor EXTREMEM UNWETTER`, severity: 'extreme', description, validUntil: iso(now + 2 * HOUR) },
    { headline: `${MARK} Amtliche WARNUNG vor DAUERREGEN`, severity: 'moderate', description, validUntil: '' },
    { headline: `${MARK} Amtliche UNWETTERWARNUNG vor SCHWEREM GEWITTER`, severity: 'severe', description, validUntil: iso(now - HOUR) },
  ];
}

const round5 = (n) => Math.round(n * 1e5) / 1e5;
const round1 = (n) => Math.round(n * 10) / 10;

/**
 * A rectangle reaching `halfLon` and `halfLat` degrees either side of the
 * point `dLon`, `dLat` degrees from the centre, as a closed GeoJSON ring of
 * [lon, lat].
 */
function rectangle({ lat, lon }, [halfLon, halfLat], [dLon, dLat] = [0, 0]) {
  const [w, e, s, n] = [lon + dLon - halfLon, lon + dLon + halfLon, lat + dLat - halfLat, lat + dLat + halfLat].map(round5);
  return [[w, s], [e, s], [e, n], [w, n], [w, s]];
}

const polygon = (ring) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} });

/**
 * A rectangle over the city centre, 0.15° wide and 0.08° high (about 10 by
 * 9 km), as a closed GeoJSON ring of [lon, lat].
 */
export function stormArea(center) {
  return rectangle(center, [0.075, 0.04]);
}

/** One severe civil-protection (MoWaS) warning over the centre, issued half an hour before `now`. */
export function stormNina(now, center) {
  return [{
    id: 'mow.synthetic-storm-1',
    version: 1,
    startDate: iso(now - 30 * MINUTE),
    expiresAt: iso(now + 12 * HOUR),
    severity: 'severe',
    urgency: 'Immediate',
    type: 'Alert',
    source: 'mowas',
    headline: `${MARK} Probewarnung Sturm: Aufenthalt im Freien meiden`,
    description: 'Synthetische Warnung für die lokale Entwicklung. Es besteht keine Gefahr.',
    instruction: 'Es ist nichts zu tun.',
    area: polygon(stormArea(center)),
  }];
}

const NOT_REAL = 'es besteht keine Gefahr. Dieser Text ist absichtlich lang.';
const IF_IT_WERE_REAL = 'Es ist nichts zu tun, dies ist eine Probewarnung. Im Ernstfall stünde hier:';

/**
 * Five long civil-protection warnings at once, one at each severity and an
 * all-clear (type Cancel) at severe, in the order the NINA ingestion stores
 * them (packages/server/src/cron/ingest-nina.ts: most severe first, then the
 * newest first). Each has an area of its own around the centre, within
 * 0.11° of longitude and 0.06° of latitude of it; one has no expiry.
 */
export function ninaWarnings(now, center) {
  return [
    {
      id: 'mow.synthetic-nina-extreme',
      version: 1,
      startDate: iso(now - 5 * MINUTE),
      expiresAt: iso(now + 6 * HOUR),
      severity: 'extreme',
      urgency: 'Immediate',
      type: 'Alert',
      source: 'mowas',
      headline: `${MARK} Probewarnung Gefahrstoffaustritt nach einem Brand in einem Industriebetrieb: Fenster und Türen geschlossen halten, Lüftungs- und Klimaanlagen ausschalten, das betroffene Gebiet weiträumig meiden`,
      description: `Synthetische Warnung für die lokale Entwicklung, ${NOT_REAL} Bei einem Brand in einem Industriebetrieb sind nach Angaben der Einsatzleitung Rauchgase ausgetreten, die der Wind über mehrere Stadtteile trägt. Messfahrzeuge der Feuerwehr sind unterwegs, erste Ergebnisse werden in den nächsten Stunden erwartet. Bis dahin gilt die Warnung für das gesamte markierte Gebiet. Bitte wählen Sie den Notruf nur in dringenden Fällen, damit die Leitungen für Menschen in Not frei bleiben. Weitere Informationen folgen, sobald die Lage neu bewertet ist.`,
      instruction: `${IF_IT_WERE_REAL} Suchen Sie geschlossene Räume auf und bleiben Sie dort. Schließen Sie Fenster und Türen, schalten Sie Lüftungs- und Klimaanlagen aus. Informieren Sie Ihre Nachbarinnen und Nachbarn, besonders ältere Menschen. Verfolgen Sie die Meldungen in Radio, Fernsehen und Warn-Apps.`,
      area: polygon(rectangle(center, [0.05, 0.03])),
    },
    {
      id: 'katwarn.synthetic-nina-severe',
      version: 1,
      startDate: iso(now - 20 * MINUTE),
      expiresAt: iso(now + 3 * HOUR),
      severity: 'severe',
      urgency: 'Immediate',
      type: 'Alert',
      source: 'katwarn',
      headline: `${MARK} Probewarnung Großbrand mit starker Rauchentwicklung: Rauchgase können Augen und Atemwege reizen, der Bereich um die Einsatzstelle ist großräumig abgesperrt`,
      description: `Synthetische Warnung für die lokale Entwicklung, ${NOT_REAL} In einer Lagerhalle ist ein Großbrand ausgebrochen, die Rauchwolke ist weithin sichtbar. Die Feuerwehr ist mit einem Großaufgebot vor Ort und rechnet mit Löscharbeiten bis in die Nacht. Straßen rund um die Einsatzstelle sind gesperrt, Busse werden umgeleitet.`,
      instruction: `${IF_IT_WERE_REAL} Meiden Sie das Gebiet und folgen Sie den Anweisungen der Einsatzkräfte. Halten Sie Fenster und Türen geschlossen, solange Sie Brandgeruch wahrnehmen.`,
      area: polygon(rectangle(center, [0.03, 0.02], [0.07, 0.035])),
    },
    {
      id: 'mow.synthetic-nina-all-clear',
      version: 3,
      startDate: iso(now - 50 * MINUTE),
      expiresAt: iso(now + HOUR),
      severity: 'severe',
      urgency: 'Past',
      type: 'Cancel',
      source: 'mowas',
      headline: `${MARK} Entwarnung: Die Probewarnung vor einer Störung der Trinkwasserversorgung ist aufgehoben, Leitungswasser kann wieder ohne Einschränkungen verwendet werden`,
      description: 'Synthetische Entwarnung für die lokale Entwicklung, es bestand keine Gefahr. Die Untersuchungen des Trinkwassers haben keine Auffälligkeiten mehr ergeben. Das Abkochgebot für die betroffenen Stadtteile ist aufgehoben.',
      instruction: 'Es ist nichts zu tun.',
      area: polygon(rectangle(center, [0.03, 0.02], [-0.07, 0.035])),
    },
    {
      id: 'biwapp.synthetic-nina-moderate',
      version: 2,
      startDate: iso(now - 90 * MINUTE),
      severity: 'moderate',
      urgency: 'Expected',
      type: 'Update',
      source: 'biwapp',
      headline: `${MARK} Probewarnung Unwetterfolgen, aktualisiert: umgestürzte Bäume und gesperrte Straßen in mehreren Stadtteilen, Einsatzkräfte räumen die Fahrbahnen, Verzögerungen im Verkehr bis zum Abend`,
      description: `Synthetische Warnung für die lokale Entwicklung, ${NOT_REAL} Nach dem Sturm der vergangenen Nacht liegen in mehreren Stadtteilen Bäume und Äste auf Straßen, Gehwegen und Gleisen. Die Aufräumarbeiten dauern an. Diese Meldung ersetzt die vorherige Fassung: Inzwischen sind weitere Straßen betroffen.`,
      instruction: `${IF_IT_WERE_REAL} Meiden Sie Parks und Wälder. Achten Sie auf herabfallende Äste und folgen Sie den Umleitungen.`,
      area: polygon(rectangle(center, [0.04, 0.025], [-0.07, -0.035])),
    },
    {
      id: 'police.synthetic-nina-minor',
      version: 1,
      startDate: iso(now - 3 * HOUR),
      expiresAt: iso(now + 12 * HOUR),
      severity: 'minor',
      urgency: 'Future',
      type: 'Alert',
      source: 'police',
      headline: `${MARK} Probehinweis Großveranstaltung im Stadtzentrum: weiträumige Straßensperrungen und volle Bahnen bis in die späten Abendstunden, bitte planen Sie mehr Zeit für Ihre Wege ein`,
      description: `Synthetischer Hinweis für die lokale Entwicklung, ${NOT_REAL} Zu einer Großveranstaltung werden mehrere hunderttausend Besucherinnen und Besucher erwartet. Rund um das Veranstaltungsgelände gelten ab dem Mittag Sperrungen für den Autoverkehr.`,
      instruction: `${IF_IT_WERE_REAL} Nutzen Sie nach Möglichkeit Bus und Bahn und folgen Sie den Hinweisen der Polizei vor Ort.`,
      area: polygon(rectangle(center, [0.02, 0.012], [0.07, -0.035])),
    },
  ];
}

/**
 * The warmest temperature anywhere in the frost scenario's weather (°C):
 * just below zero, so a display rounding to whole degrees meets -0 there.
 */
export const FROST_WARMEST = -0.3;

/** WMO rain codes and the code for the same precipitation below zero: snow, or freezing drizzle. */
export const SNOW_FOR_RAIN = Object.freeze({ 51: 56, 53: 56, 55: 57, 61: 71, 63: 73, 65: 75, 80: 85, 81: 86, 82: 86 });

const isNumber = (n) => typeof n === 'number' && Number.isFinite(n);

/**
 * The weather `data` on a day of frost: every temperature (current and
 * feels-like, each hour's, each day's high and low) moves down by the one
 * amount that makes the warmest of them FROST_WARMEST, so the forecast keeps
 * its shape below zero, and rain falls as snow. Nothing else changes.
 */
export function frostWeather(data) {
  const hourly = data.hourly ?? [];
  const daily = data.daily ?? [];
  const temps = [data.current?.temp, data.current?.feelsLike, ...hourly.map((h) => h.temp), ...daily.flatMap((d) => [d.high, d.low])].filter(isNumber);
  if (temps.length === 0) throw new Error('frost: the weather holds no temperature to lower');
  const shift = FROST_WARMEST - Math.max(...temps);
  const freeze = (item, keys) => {
    const out = { ...item };
    for (const key of keys) if (isNumber(item[key])) out[key] = round1(item[key] + shift);
    if (Object.hasOwn(SNOW_FOR_RAIN, item.weatherCode)) out.weatherCode = SNOW_FOR_RAIN[item.weatherCode];
    return out;
  };
  const frozen = { ...data };
  if (data.current) frozen.current = freeze(data.current, ['temp', 'feelsLike']);
  if (data.hourly) frozen.hourly = hourly.map((h) => freeze(h, ['temp']));
  if (data.daily) frozen.daily = daily.map((d) => freeze(d, ['high', 'low']));
  return frozen;
}

/**
 * Where a scenario runs: the city's centre (its config's coordinates) and
 * the snapshot types its seed writes, from the data sets the product's
 * syntheticCoverage names (packages/server/src/synthetic/generate.ts).
 */
export function scenarioPlace({ coordinates }, dataSets) {
  const held = new Set(dataSets);
  return Object.freeze({
    center: Object.freeze({ lat: coordinates.lat, lon: coordinates.lon }),
    types: Object.freeze(Object.entries(SNAPSHOT).filter(([set]) => held.has(set)).map(([, type]) => type)),
  });
}

/** Every scenario: what it shows, and its changes at `now` (ms) over the city centre. At most one change per snapshot type. */
export const SCENARIOS = Object.freeze({
  default: {
    summary: 'the synthetic seed as generated',
    changes: () => [],
  },
  quiet: {
    summary: 'no transit disruptions, no weather or civil-protection warnings, everything fresh',
    changes: () => [
      put(SNAPSHOT.transit, []),
      patchLatest(SNAPSHOT.weather, (data) => ({ ...data, alerts: [] })),
      put(SNAPSHOT.nina, []),
    ],
  },
  outage: {
    summary: 'transit data 4 hours and weather data 6 hours old, no water-level data at all',
    changes: () => [
      backdate(SNAPSHOT.transit, OUTAGE_AGE.transit),
      backdate(SNAPSHOT.weather, OUTAGE_AGE.weather),
      remove(SNAPSHOT.waterLevels),
    ],
  },
  storm: {
    summary: 'five DWD weather warnings (moderate, severe, extreme, one with no end, one ended an hour ago) and a severe civil-protection warning',
    changes: (now, center) => [
      patchLatest(SNAPSHOT.weather, (data) => ({ ...data, alerts: stormAlerts(now) })),
      put(SNAPSHOT.nina, stormNina(now, center)),
    ],
  },
  'no-data': {
    summary: 'no transit, weather or civil-protection data at all, as before the first fetch',
    changes: () => [
      remove(SNAPSHOT.transit),
      remove(SNAPSHOT.weather),
      remove(SNAPSHOT.nina),
    ],
  },
  'nina-warnings': {
    summary: 'five long civil-protection warnings at once: extreme, severe, an all-clear, moderate and minor',
    changes: (now, center) => [
      put(SNAPSHOT.nina, ninaWarnings(now, center)),
    ],
  },
  frost: {
    summary: `every temperature below zero (current, hourly and daily, the warmest ${FROST_WARMEST} °C), rain falling as snow`,
    changes: () => [
      patchLatest(SNAPSHOT.weather, frostWeather),
    ],
  },
});

export const SCENARIO_NAMES = Object.freeze(Object.keys(SCENARIOS));
export const DEFAULT_SCENARIO = 'default';

function scenarioOf(name) {
  if (!Object.hasOwn(SCENARIOS, name)) throw new Error(`unknown scenario ${name}: use one of ${SCENARIO_NAMES.join(', ')}`);
  return SCENARIOS[name];
}

const NO_CENTER = Object.freeze({ lat: 0, lon: 0 });

/** The snapshot types `name` changes, so only their rows need reading; with a place, only those the place's city holds. */
export function scenarioTypes(name, place) {
  const types = scenarioOf(name).changes(0, NO_CENTER).map((change) => change.type);
  return place ? types.filter((type) => place.types.includes(type)) : types;
}

/** The snapshot types `name` changes that the place's city has no data for, so the scenario leaves them out. */
export function leftOutTypes(name, place) {
  return scenarioTypes(name).filter((type) => !place.types.includes(type));
}

/** Newest first, as the API picks: by fetched_at, then by id (a row not written yet, id null, counts as newest). */
export function newestFirst(a, b) {
  return b.fetchedAt - a.fetchedAt || (b.id ?? Infinity) - (a.id ?? Infinity);
}

/**
 * Applies scenario `name` at `now` (a Date or ms) to `rows`, an object of
 * snapshot type to [{ id, fetchedAt (ms), data }], of the city `place`
 * describes (scenarioPlace). Returns the rows of each type afterwards, newest
 * first, the changes that get there:
 * { deletes: [{ type, id }], updates: [{ type, id, data?, fetchedAt? }], inserts: [{ type, data, fetchedAt }] },
 * and the types it left out because the city holds none (`leftOut`).
 * Throws when a change needs a row the seed did not write for a type the city
 * holds, so a run never shows the seed in place of the scenario it was asked for.
 */
export function planScenario(name, rows, now, place) {
  const scenario = scenarioOf(name);
  if (!place || !place.center || !Array.isArray(place.types)) throw new Error(`scenario ${name}: no place to run it on`);
  const nowMs = now instanceof Date ? now.getTime() : now;
  const result = {};
  for (const [type, list] of Object.entries(rows)) result[type] = [...list].sort(newestFirst);
  const changes = { deletes: [], updates: [], inserts: [] };
  const seen = new Set();
  const leftOut = [];

  for (const change of scenario.changes(nowMs, place.center)) {
    const { type } = change;
    if (seen.has(type)) throw new Error(`scenario ${name} changes ${type} twice`);
    seen.add(type);
    if (!place.types.includes(type)) {
      leftOut.push(type);
      continue;
    }
    const list = result[type] ?? [];
    const [newest, ...older] = list;
    const dropAll = () => changes.deletes.push(...list.map((row) => ({ type, id: row.id })));

    switch (change.kind) {
      case 'remove':
        dropAll();
        result[type] = [];
        break;
      case 'put':
        dropAll();
        changes.inserts.push({ type, data: change.data, fetchedAt: nowMs });
        result[type] = [{ id: null, fetchedAt: nowMs, data: change.data }];
        break;
      case 'backdate': {
        if (!newest) throw new Error(`scenario ${name}: the seed wrote no ${type} row to backdate`);
        const at = nowMs - change.ageMs;
        const since = older.filter((row) => row.fetchedAt >= at);
        changes.deletes.push(...since.map((row) => ({ type, id: row.id })));
        const moved = newest.fetchedAt > at ? { ...newest, fetchedAt: at } : newest;
        if (moved !== newest) changes.updates.push({ type, id: newest.id, fetchedAt: at });
        result[type] = [moved, ...older.filter((row) => row.fetchedAt < at)];
        break;
      }
      case 'patch-latest': {
        if (!newest) throw new Error(`scenario ${name}: the seed wrote no ${type} row to change`);
        const data = change.patch(structuredClone(newest.data));
        changes.updates.push({ type, id: newest.id, data });
        result[type] = [{ ...newest, data }, ...older];
        break;
      }
      default:
        throw new Error(`scenario ${name}: unknown change ${change.kind}`);
    }
  }
  return { rows: result, changes, leftOut };
}

/**
 * Reads the rows `name` changes for the place's city from `store`
 * ({ rows(type), write(changes) }, lib/snapshot-store.mjs in a run), plans
 * the scenario at `now` and writes its changes. Returns the changes.
 */
export async function applyScenario(store, name, now, place) {
  const rows = {};
  for (const type of scenarioTypes(name, place)) rows[type] = await store.rows(type);
  const { changes } = planScenario(name, rows, now, place);
  await store.write(changes);
  return changes;
}
