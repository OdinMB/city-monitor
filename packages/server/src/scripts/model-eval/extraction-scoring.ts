/**
 * Scoring for the extraction sites (news classification, police locations):
 * map responses back to sample items the way production would, compute
 * reliability, label and agreement metrics, and apply the automatic
 * decision rules R1–R5.
 */

import { checkBatchIndices, stripBareCityLabel } from '../../lib/openai.js';
import { VALID_CATEGORIES } from '../../lib/llm-prompts.js';
import type { CallRecord } from './arms.js';
import { callStats, hasJunkCharacters, ratio, type CallStats } from './call-stats.js';

export type ExtractionSite = 'news' | 'police';

/** A filter or geo response item; the news-only fields are absent for police. */
export interface ExtractionItem {
  index: number;
  locationLabel: string | null;
  relevant_to_city?: boolean;
  category?: string;
  importance?: number;
}

export type ExtractionResponse = { items: ExtractionItem[] };

export interface Coverage {
  /** Responses `checkBatchIndices` rejects — production discards them. */
  rejected: number;
  /** Sample items without an accepted verdict, whatever the cause. */
  missing: number;
  /**
   * The part of `missing` left out of accepted responses. For police this is
   * how several models answer "no location" (the prompt says to omit the
   * field), and production marks such a report attempted exactly like a null.
   */
  omitted: number;
  duplicates: number;
  outOfRange: number;
}

/** Map accepted verdicts back to input ids, the way production would. */
export function collectVerdicts(
  records: readonly CallRecord<ExtractionResponse>[],
  n: number,
): { verdicts: Map<string, ExtractionItem>; coverage: Coverage } {
  const verdicts = new Map<string, ExtractionItem>();
  let rejected = 0;
  let omitted = 0;
  let duplicates = 0;
  let outOfRange = 0;

  for (const record of records) {
    if (record.error || !record.parsed) continue;
    const size = record.inputIds.length;
    const items = record.parsed.items;
    outOfRange += items.filter((item) => !Number.isInteger(item.index) || item.index < 0 || item.index >= size).length;

    const checked = checkBatchIndices(items, size);
    if (!checked.ok) {
      rejected++;
      continue;
    }
    duplicates += checked.duplicates;
    omitted += size - checked.items.length;
    for (const item of checked.items) verdicts.set(record.inputIds[item.index]!, item);
  }

  return { verdicts, coverage: { rejected, missing: n - verdicts.size, omitted, duplicates, outOfRange } };
}

/** Letters outside the Latin script, control characters, leaked tokens, or > 80 chars. */
export function isJunkLabel(label: string): boolean {
  if (label.length > 80) return true;
  if (hasJunkCharacters(label, false)) return true;
  for (const [letter] of label.matchAll(/\p{L}/gu)) {
    if (!/\p{Script=Latin}/u.test(letter)) return true;
  }
  return false;
}

export interface NormalizedVerdict {
  relevant_to_city: boolean;
  category: string;
  importance: number;
}

/** Normalise a news verdict exactly as `filterAndGeolocateNews` does. */
export function normalizeVerdict(item: ExtractionItem): NormalizedVerdict {
  return {
    relevant_to_city: item.relevant_to_city === true,
    category: item.category && VALID_CATEGORIES.has(item.category) ? item.category : 'local',
    importance: Math.max(0, Math.min(1, item.importance ?? 0)),
  };
}

function hasInvalidValues(item: ExtractionItem): boolean {
  const badCategory = !item.category || !VALID_CATEGORIES.has(item.category);
  const badImportance = item.importance === undefined || !(item.importance >= 0 && item.importance <= 1);
  return badCategory || badImportance;
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface ExtractionContext {
  /** Sample size — rates are over all sample items. */
  n: number;
  cityName: string;
  bbox: BoundingBox;
  /** Geocoder result per label (after `stripBareCityLabel`); null = not found. */
  geo: ReadonlyMap<string, GeoPoint | null>;
  /** Monthly calls in production, for $/month. */
  volume: number;
}

export interface ExtractionMetrics extends CallStats, Coverage {
  arm: string;
  site: ExtractionSite;
  n: number;
  calls: number;
  invalidValues: number;
  junkLabels: number;
  junkExamples: string[];
  labelRate: number;
  geocodedRate: number;
  onMapRate: number;
  /** News: relevant and importance > 0.5 (the briefing's cut-off), over all sample items. */
  briefingEligibleRate?: number;
  relevanceAgreement?: number;
  categoryAgreement?: number;
  importanceFlips?: number;
  sameLabelRate?: number;
  costPerMonth: number;
}

export interface ExtractionScore {
  metrics: ExtractionMetrics;
  verdicts: Map<string, ExtractionItem>;
}

function inBox(point: GeoPoint, box: BoundingBox): boolean {
  return point.lat >= box.south && point.lat <= box.north && point.lon >= box.west && point.lon <= box.east;
}

function compareWithBaseline(
  site: ExtractionSite,
  verdicts: ReadonlyMap<string, ExtractionItem>,
  baseline: ReadonlyMap<string, ExtractionItem>,
  cityLower: string,
): Pick<ExtractionMetrics, 'relevanceAgreement' | 'categoryAgreement' | 'importanceFlips' | 'sameLabelRate'> {
  const pairs = [...verdicts].flatMap(([id, item]) => {
    const base = baseline.get(id);
    return base ? [{ item, base }] : [];
  });
  // Undefined (rendered "–", failing R4/R5) when there is nothing to compare.
  const share = (count: number, total: number) => (total === 0 ? undefined : count / total);
  const labelOf = (item: ExtractionItem) => (stripBareCityLabel(item.locationLabel, cityLower) ?? '').trim().toLowerCase();
  const sameLabelRate = share(pairs.filter(({ item, base }) => labelOf(item) === labelOf(base)).length, pairs.length);
  if (site === 'police') return { sameLabelRate };

  const normalized = pairs.map(({ item, base }) => ({ c: normalizeVerdict(item), b: normalizeVerdict(base) }));
  const bothRelevant = normalized.filter(({ c, b }) => c.relevant_to_city && b.relevant_to_city);
  return {
    sameLabelRate,
    relevanceAgreement: share(normalized.filter(({ c, b }) => c.relevant_to_city === b.relevant_to_city).length, normalized.length),
    categoryAgreement: share(bothRelevant.filter(({ c, b }) => c.category === b.category).length, bothRelevant.length),
    importanceFlips: share(normalized.filter(({ c, b }) => (c.importance > 0.5) !== (b.importance > 0.5)).length, normalized.length),
  };
}

export function scoreExtraction(
  site: ExtractionSite,
  arm: string,
  records: readonly CallRecord<ExtractionResponse>[],
  ctx: ExtractionContext,
  baseline?: ReadonlyMap<string, ExtractionItem>,
): ExtractionScore {
  const { verdicts, coverage } = collectVerdicts(records, ctx.n);
  const cityLower = ctx.cityName.toLowerCase();
  const items = [...verdicts.values()];

  const junk = items
    .map((item) => item.locationLabel)
    .filter((label): label is string => !!label && isJunkLabel(label));
  const labels = items
    .map((item) => stripBareCityLabel(item.locationLabel, cityLower))
    .filter((label): label is string => !!label);
  const points = labels.map((label) => ctx.geo.get(label)).filter((p): p is GeoPoint => !!p);

  const stats = callStats(records);
  const metrics: ExtractionMetrics = {
    arm,
    site,
    n: ctx.n,
    calls: records.length,
    ...stats,
    ...coverage,
    invalidValues: site === 'news' ? items.filter(hasInvalidValues).length : 0,
    junkLabels: junk.length,
    junkExamples: junk.slice(0, 5).map((label) => JSON.stringify(label)),
    labelRate: ratio(labels.length, ctx.n),
    geocodedRate: ratio(points.length, ctx.n),
    onMapRate: ratio(points.filter((p) => inBox(p, ctx.bbox)).length, ctx.n),
    ...(site === 'news'
      ? { briefingEligibleRate: ratio(items.map(normalizeVerdict).filter((v) => v.relevant_to_city && v.importance > 0.5).length, ctx.n) }
      : {}),
    ...(baseline ? compareWithBaseline(site, verdicts, baseline, cityLower) : {}),
    costPerMonth: stats.costPerCall * ctx.volume,
  };
  return { metrics, verdicts };
}

// ---------------------------------------------------------------------------
// Automatic decision
// ---------------------------------------------------------------------------

export interface RuleResult {
  id: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  pass: boolean;
  detail: string;
}

export interface CandidateEvaluation {
  arm: string;
  pass: boolean;
  rules: RuleResult[];
}

export interface ExtractionDecision {
  winner: string | null;
  evaluations: CandidateEvaluation[];
}

const EPSILON = 1e-9;
const pct = (v: number | undefined) => (v === undefined ? 'n/a' : `${(v * 100).toFixed(1)}%`);

function evaluateCandidate(site: ExtractionSite, b: ExtractionMetrics, c: ExtractionMetrics): CandidateEvaluation {
  const failures = c.refusals + c.truncated + c.parseErrors;
  // A police report left out of an accepted response ends up exactly like a null
  // label in production (marked attempted, no pin), so it is not a defect there.
  const lost = (m: ExtractionMetrics) => (site === 'police' ? m.missing - m.omitted : m.missing);
  const defects = (m: ExtractionMetrics) => lost(m) + m.duplicates + m.outOfRange;
  const defectLimit = Math.max(defects(b), 0.01 * c.n);
  const onMapTolerance = Math.max(0.03, 1 / c.n);
  const omittedNote = site === 'police' && c.omitted > 0 ? ` (${c.omitted} left out = no location, not counted)` : '';

  const rules: RuleResult[] = [
    {
      id: 'R1',
      pass: c.apiErrors === 0 && failures === 0 && c.rejected === 0 && defects(c) <= defectLimit + EPSILON,
      detail: `${c.apiErrors} API errors, ${failures} refusal/truncated/unparseable, ${c.rejected} rejected responses, ${defects(c)} missing or invalid-index items${omittedNote} (limit ${defectLimit.toFixed(1)})`,
    },
    {
      id: 'R2',
      pass: c.junkLabels === 0 && (site === 'police' || c.invalidValues <= b.invalidValues),
      detail: site === 'news'
        ? `${c.junkLabels} junk labels, ${c.invalidValues} invalid values (baseline ${b.invalidValues})`
        : `${c.junkLabels} junk labels`,
    },
    {
      id: 'R3',
      pass: c.onMapRate >= b.onMapRate - onMapTolerance - EPSILON,
      detail: `on map ${pct(c.onMapRate)} vs baseline ${pct(b.onMapRate)} (tolerance ${pct(onMapTolerance)})`,
    },
  ];
  if (site === 'news') {
    rules.push(
      {
        id: 'R4',
        pass: (c.relevanceAgreement ?? 0) >= 0.9 - EPSILON,
        detail: `relevance agreement ${pct(c.relevanceAgreement)} (min 90%)`,
      },
      {
        id: 'R5',
        pass: (c.importanceFlips ?? 1) <= 0.1 + EPSILON,
        detail: `importance flips across 0.5: ${pct(c.importanceFlips)} (max 10%)`,
      },
    );
  }
  return { arm: c.arm, pass: rules.every((r) => r.pass), rules };
}

/** The first candidate (in the given, cheapest-first order) that passes every rule wins. */
export function decideExtraction(
  site: ExtractionSite,
  baseline: ExtractionMetrics,
  candidates: readonly ExtractionMetrics[],
): ExtractionDecision {
  const evaluations = candidates.map((c) => evaluateCandidate(site, baseline, c));
  return { winner: evaluations.find((e) => e.pass)?.arm ?? null, evaluations };
}
