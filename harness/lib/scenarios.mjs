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
 *   ingestion keeps that list in the cache rather than writing it; synthetic
 *   mode runs no ingestion and warms the cache from the database, so a row
 *   holding the empty list makes the API answer the same.
 *
 * planScenario is pure: the same rows and `now` give the same result, and
 * nothing is random.
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

/** A rectangle over central Berlin, as a closed GeoJSON ring of [lon, lat]. */
const STORM_AREA = Object.freeze([[13.33, 52.48], [13.48, 52.48], [13.48, 52.56], [13.33, 52.56], [13.33, 52.48]]);

/** One severe civil-protection (MoWaS) warning, issued half an hour before `now`. */
export function stormNina(now) {
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
    area: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [STORM_AREA.map((p) => [...p])] }, properties: {} },
  }];
}

/** Every scenario: what it shows, and its changes at `now` (ms). At most one change per snapshot type. */
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
    changes: (now) => [
      patchLatest(SNAPSHOT.weather, (data) => ({ ...data, alerts: stormAlerts(now) })),
      put(SNAPSHOT.nina, stormNina(now)),
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
});

export const SCENARIO_NAMES = Object.freeze(Object.keys(SCENARIOS));
export const DEFAULT_SCENARIO = 'default';

function scenarioOf(name) {
  if (!Object.hasOwn(SCENARIOS, name)) throw new Error(`unknown scenario ${name}: use one of ${SCENARIO_NAMES.join(', ')}`);
  return SCENARIOS[name];
}

/** The snapshot types `name` changes, so only their rows need reading. */
export function scenarioTypes(name) {
  return scenarioOf(name).changes(0).map((change) => change.type);
}

/** Newest first, as the API picks: by fetched_at, then by id (a row not written yet, id null, counts as newest). */
export function newestFirst(a, b) {
  return b.fetchedAt - a.fetchedAt || (b.id ?? Infinity) - (a.id ?? Infinity);
}

/**
 * Applies scenario `name` at `now` (a Date or ms) to `rows`, an object of
 * snapshot type to [{ id, fetchedAt (ms), data }]. Returns the rows of each
 * type afterwards, newest first, and the changes that get there:
 * { deletes: [{ type, id }], updates: [{ type, id, data?, fetchedAt? }], inserts: [{ type, data, fetchedAt }] }.
 * Throws when a change needs a row the seed did not write, so a run never
 * shows the seed in place of the scenario it was asked for.
 */
export function planScenario(name, rows, now) {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const result = {};
  for (const [type, list] of Object.entries(rows)) result[type] = [...list].sort(newestFirst);
  const changes = { deletes: [], updates: [], inserts: [] };
  const seen = new Set();

  for (const change of scenarioOf(name).changes(nowMs)) {
    const { type } = change;
    if (seen.has(type)) throw new Error(`scenario ${name} changes ${type} twice`);
    seen.add(type);
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
  return { rows: result, changes };
}

/**
 * Reads the rows `name` changes from `store` ({ rows(type), write(changes) },
 * lib/snapshot-store.mjs in a run), plans the scenario at `now` and writes
 * its changes. Returns the changes.
 */
export async function applyScenario(store, name, now) {
  const rows = {};
  for (const type of scenarioTypes(name)) rows[type] = await store.rows(type);
  const { changes } = planScenario(name, rows, now);
  await store.write(changes);
  return changes;
}
