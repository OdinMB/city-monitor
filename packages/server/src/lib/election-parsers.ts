/**
 * One parser per election-result provider (`dataSources.electionResults.provider`),
 * each reading the official file's rows into votes or shares per area, and
 * `buildElectionResults`, which turns them into the shares, turnout and
 * strongest party the map and the political tile show
 * (.context/election-results.md).
 */
import type { ElectionAreaResult, ElectionResults, ElectionResultSource, ElectionShare } from '@city-monitor/shared';

/** One area as the source gives it: votes per party (Berlin, München) or shares in percent (Hamburg). */
export interface RawElectionArea {
  id: string;
  name: string;
  eligible: number | null;
  voters: number | null;
  /** Turnout in percent, where the source states it instead of the counts. */
  turnout?: number | null;
  /** Votes, or percent when `unit` is 'pct'; in the source's column order. */
  parties: Map<string, number>;
  /** The source's own "other parties" share in percent (Hamburg's "Übrige"). */
  otherPct?: number;
}

export interface RawElection {
  unit: 'votes' | 'pct';
  areas: RawElectionArea[];
  /** The city's row where the source has one; otherwise the areas are summed (counts only). */
  total?: RawElectionArea;
}

/** A party's share city-wide from which it gets its own column; the rest go into `otherPct`. */
const MIN_CITY_SHARE = 1;

/**
 * The sources' spellings of the parties whose colours the app keeps
 * (lib/party-colors.ts in the web app), keyed upper-case.
 */
const PARTY_NAMES: Record<string, string> = {
  'GRÜNE': 'Grüne',
  'BÜNDNIS 90/DIE GRÜNEN': 'Grüne',
  'DIE LINKE': 'Die Linke',
  'FREIE WÄHLER': 'Freie Wähler',
};

/** A party name as the app writes it: line breaks and hyphenation from the header undone, the common parties spelled one way. */
export function normalizeParty(raw: string): string {
  const name = raw.replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ').trim();
  const upper = name.toUpperCase();
  if (PARTY_NAMES[upper]) return PARTY_NAMES[upper];
  // München's "FREIE WÄHLER / FW München"
  if (upper.startsWith('FREIE WÄHLER')) return 'Freie Wähler';
  return name;
}

/** A header cell's text without the line breaks and soft hyphens of a two-line header ("Wahlbe-\nteiligung"). */
function headerText(cell: unknown): string {
  return String(cell ?? '').replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ').trim();
}

/** A count or percentage cell: numbers as they are, "– " (none) and blanks as 0. */
function num(cell: unknown): number {
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : 0;
  if (typeof cell !== 'string') return 0;
  const n = parseFloat(cell.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Berlin: Abgeordnetenhaus, per Wahlbezirk (Amt für Statistik Berlin-Brandenburg)
// ---------------------------------------------------------------------------

/** The XLSX sheet with the second votes (Zweitstimmen) per Wahlbezirk. */
export const BERLIN_AGH_SHEET = 'AGH_W2';

/**
 * Second votes per Abgeordnetenhaus Wahlkreis: the polling and postal districts
 * (Urnen- and Briefwahlbezirke) of sheet AGH_W2 summed by Bezirk and Wahlkreis.
 * The ID is the Bezirk and Wahlkreis numbers, two digits each ("0101"), as in
 * the Wahlkreis outlines; the name is "<Bezirk> <n>" ("Mitte 1"). Postal
 * districts have no eligible voters of their own, so the sums hold.
 */
export function parseBerlinAghSheet(rows: unknown[][]): RawElection {
  const header = (rows[0] ?? []).map(headerText);
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`Berlin AGH sheet lacks the column "${name}"`);
    return i;
  };
  const bezNr = col('Bezirksnummer');
  const bezName = col('Bezirksname');
  const wk = col('Abgeordnetenhauswahlkreis');
  const eligible = col('Wahlberechtigte insgesamt');
  const voters = col('Wählende');
  const firstParty = col('Ungültige Stimmen') + 1;
  const parties = header.slice(firstParty).map((h, i) => [firstParty + i, normalizeParty(h)] as const).filter(([, p]) => p !== '');
  if (parties.length === 0) throw new Error('Berlin AGH sheet has no party columns');

  const areas = new Map<string, RawElectionArea>();
  for (const row of rows.slice(1)) {
    if (!Array.isArray(row)) continue;
    const bez = String(row[bezNr] ?? '').trim();
    const nr = String(row[wk] ?? '').trim();
    if (!/^\d+$/.test(bez) || !/^\d+$/.test(nr)) continue;
    const id = bez.padStart(2, '0') + nr.padStart(2, '0');
    let area = areas.get(id);
    if (!area) {
      area = { id, name: `${String(row[bezName] ?? '').trim()} ${Number(nr)}`, eligible: 0, voters: 0, parties: new Map() };
      areas.set(id, area);
    }
    area.eligible! += num(row[eligible]);
    area.voters! += num(row[voters]);
    for (const [i, party] of parties) area.parties.set(party, (area.parties.get(party) ?? 0) + num(row[i]));
  }
  return { unit: 'votes', areas: [...areas.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

// ---------------------------------------------------------------------------
// Hamburg: Bürgerschaft, per Stadtteil (Statistikamt Nord)
// ---------------------------------------------------------------------------

/**
 * Landesliste shares per Stadtteil: the rows under the "Bezirk/Stadtteil"
 * header, without the Bezirk totals ("Bezirk Altona"), with the city's row
 * ("Hamburg") as the total. Small Stadtteile come as groups
 * ("Billbrook/Rothenburgsort"); `outlineIds` names the outlines each covers
 * (`stadtteilOutlineIds`). A row no outline matches is dropped and reported.
 */
export function parseHamburgStadtteilSheet(
  rows: unknown[][],
  outlines: ReadonlyMap<string, { name?: string }>,
): RawElection & { unmatched: string[] } {
  const headerIdx = rows.findIndex((r) => Array.isArray(r) && headerText(r[0]).startsWith('Bezirk/Stadtteil'));
  if (headerIdx < 0) throw new Error('Hamburg sheet lacks the "Bezirk/Stadtteil" header');
  const header = rows[headerIdx]!.map(headerText);
  const turnoutCol = header.findIndex((h) => h.startsWith('Wahlbeteiligung'));
  const otherCol = header.findIndex((h) => h.startsWith('Übrige'));
  if (turnoutCol < 0 || otherCol < 0) throw new Error('Hamburg sheet lacks the turnout or "Übrige" column');
  // The parties stand between the postal voters' share and "Übrige"
  const parties: Array<[number, string]> = [];
  for (let i = turnoutCol + 1; i < otherCol; i++) {
    if (header[i] && !header[i]!.startsWith('Brief')) parties.push([i, normalizeParty(header[i]!)]);
  }

  const areaOf = (id: string, name: string, row: unknown[]): RawElectionArea => ({
    id,
    name,
    eligible: null,
    voters: null,
    turnout: num(row[turnoutCol]),
    parties: new Map(parties.map(([i, p]) => [p, num(row[i])])),
    otherPct: num(row[otherCol]),
  });

  const areas: RawElectionArea[] = [];
  const unmatched: string[] = [];
  let total: RawElectionArea | undefined;
  for (const row of rows.slice(headerIdx + 1)) {
    if (!Array.isArray(row) || typeof row[turnoutCol] !== 'number') continue;
    const name = String(row[0] ?? '').trim();
    if (!name || name.startsWith('Bezirk ')) continue;
    if (name === 'Hamburg') {
      total = areaOf('total', name, row);
      continue;
    }
    const ids = stadtteilOutlineIds(name, outlines);
    if (ids.length === 0) {
      unmatched.push(name);
      continue;
    }
    areas.push(areaOf(ids.join('+'), name, row));
  }
  return { unit: 'pct', areas, total, unmatched };
}

/** A Stadtteil name's parts, compared without case and with "Kleiner" shortened as the outlines write it. */
function nameParts(name: string): string[] {
  return name.split('/').map((p) => p.trim().toLowerCase().replace(/^kleiner\s+/, 'kl. '));
}

/**
 * The outlines a Stadtteil row of the results covers: the one of that name,
 * or, for a group ("Moorburg/Altenwerder/Francop/Neuenfelde/Cranz"), every
 * outline whose name is made of the group's parts ("Moorburg/Altenwerder",
 * "Cranz"). Sorted by ID.
 */
export function stadtteilOutlineIds(name: string, outlines: ReadonlyMap<string, { name?: string }>): string[] {
  const wanted = name.trim().toLowerCase();
  for (const [id, o] of outlines) if (o.name?.trim().toLowerCase() === wanted) return [id];
  const parts = new Set(nameParts(name));
  if (parts.size < 2) return [];
  const ids: string[] = [];
  for (const [id, o] of outlines) {
    if (o.name && nameParts(o.name).every((p) => parts.has(p))) ids.push(id);
  }
  return ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// ---------------------------------------------------------------------------
// München: Stadtrat, per Stadtbezirk (Kreisverwaltungsreferat – Wahlamt)
// ---------------------------------------------------------------------------

/** The CSV in the Wahlamt's ZIP with the result per Stadtbezirk. */
export const MUENCHEN_STADTBEZIRK_CSV = 'stadtbezirke.stimmen.csv';

/**
 * Stadtrat votes per Stadtbezirk from the Wahlamt's semicolon CSV: the rows of
 * Stimmbezirksart 1 (polling and postal votes together; 11 and 21 are each on
 * its own), Gebietsnummer 1–25 as the outline IDs "01"–"25". Parties come as
 * repeated "Partei; Anzahl Stimmen; Prozentzahl" columns. Each voter has as
 * many votes as the council has seats, so the shares are of all votes cast
 * for parties, not of voters. The city's row (Gebietsnummer 162) is left out:
 * the total is the sum of the districts.
 */
export function parseMuenchenStadtratCsv(text: string, names: ReadonlyMap<string, { name?: string }>): RawElection {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/).filter((l) => l.trim() !== '');
  const header = (lines[0] ?? '').split(';').map((h) => h.trim());
  const col = (name: string) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`München Stadtrat CSV lacks the column "${name}"`);
    return i;
  };
  const nr = col('Gebietsnummer');
  const kind = col('Stimmbezirksart');
  const eligible = col('Wahlberechtigte gesamt');
  const voters = col('Wähler gesamt');
  const partyCols = header.flatMap((h, i) => (h === 'Partei' && header[i + 1] === 'Anzahl Stimmen' ? [i] : []));
  if (partyCols.length === 0) throw new Error('München Stadtrat CSV has no party columns');

  const areas: RawElectionArea[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(';');
    if (cells[kind]?.trim() !== '1') continue;
    const n = Number(cells[nr]);
    if (!Number.isInteger(n) || n < 1 || n > 99) continue;
    const id = String(n).padStart(2, '0');
    const parties = new Map<string, number>();
    for (const i of partyCols) {
      const party = normalizeParty(cells[i] ?? '');
      if (party) parties.set(party, (parties.get(party) ?? 0) + num(cells[i + 1]));
    }
    areas.push({ id, name: names.get(id)?.name ?? id, eligible: num(cells[eligible]), voters: num(cells[voters]), parties });
  }
  return { unit: 'votes', areas: areas.sort((a, b) => a.id.localeCompare(b.id)) };
}

// ---------------------------------------------------------------------------
// Shares, turnout, strongest party
// ---------------------------------------------------------------------------

/** Each party's share in percent of the area's party votes (or as given), and the others' share. */
function sharesOf(area: RawElectionArea, unit: RawElection['unit']): { pcts: Map<string, number>; given: number | undefined } {
  if (unit === 'pct') return { pcts: area.parties, given: area.otherPct };
  let valid = 0;
  for (const v of area.parties.values()) valid += v;
  const pcts = new Map<string, number>();
  for (const [p, v] of area.parties) pcts.set(p, valid > 0 ? (v / valid) * 100 : 0);
  return { pcts, given: undefined };
}

function sumAreas(areas: RawElectionArea[]): RawElectionArea {
  const parties = new Map<string, number>();
  let eligible = 0;
  let voters = 0;
  for (const a of areas) {
    eligible += a.eligible ?? 0;
    voters += a.voters ?? 0;
    for (const [p, v] of a.parties) parties.set(p, (parties.get(p) ?? 0) + v);
  }
  return { id: 'total', name: 'total', eligible, voters, parties };
}

/**
 * The result the app serves: the parties with at least 1 % city-wide in the
 * city's order, each area's shares of them, the rest as `otherPct`, turnout
 * and the strongest party per area. Throws when the file gave no areas.
 */
export function buildElectionResults(raw: RawElection, source: ElectionResultSource, areaLevel: ElectionResults['areaLevel']): ElectionResults {
  if (raw.areas.length === 0) throw new Error('no areas in the election result');
  const totalRaw = raw.total ?? (raw.unit === 'votes' ? sumAreas(raw.areas) : undefined);
  if (!totalRaw) throw new Error('no city-wide result');

  const totalPcts = sharesOf(totalRaw, raw.unit).pcts;
  const cityParties = [...totalPcts.entries()]
    .filter(([, pct]) => pct >= MIN_CITY_SHARE)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);

  const resultOf = (area: RawElectionArea): ElectionAreaResult => {
    const { pcts, given } = sharesOf(area, raw.unit);
    const shares: ElectionShare[] = cityParties.map((party) => ({ party, pct: round2(pcts.get(party) ?? 0) }));
    const listed = cityParties.reduce((s, p) => s + (pcts.get(p) ?? 0), 0);
    let rest = 0;
    for (const [p, v] of pcts) if (!cityParties.includes(p)) rest += v;
    const otherPct = round2(Math.max(0, given !== undefined ? given + rest : 100 - listed));
    let leader: string | null = null;
    let best = 0;
    for (const [p, v] of pcts) {
      if (v > best) { best = v; leader = p; }
    }
    const turnout = area.turnout ?? (area.eligible && area.voters !== null ? (area.voters / area.eligible) * 100 : null);
    return { id: area.id, name: area.name, turnout: turnout === null ? null : round2(turnout), shares, otherPct, leader };
  };

  const total = resultOf(totalRaw);
  return {
    election: source.election,
    date: source.date,
    areaLevel,
    total: { ...total, id: 'total', name: 'total', eligible: totalRaw.eligible || null, voters: totalRaw.voters || null },
    areas: raw.areas.map(resultOf),
    sourceUrl: source.url,
  };
}

/** The level each provider maps by. */
export const AREA_LEVEL: Record<ElectionResultSource['provider'], ElectionResults['areaLevel']> = {
  'berlin-agh-xlsx': 'wahlkreis',
  'hamburg-stadtteile-xlsx': 'stadtteil',
  'muenchen-stadtrat-zip': 'stadtbezirk',
};
