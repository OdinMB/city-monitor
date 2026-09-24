/**
 * The owner-facing eval files: blind rating sets with their answer key,
 * results.md, and the Turkish/Arabic review sheet. Rendering is pure; the
 * writer at the bottom only puts strings on disk.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MODEL_PRICING, DEFAULT_PRICING } from '../../lib/llm-client.js';
import { VOLUME, POLICE_CHUNK, type SiteId } from './arms.js';
import type { EvalInputs, BriefingInput } from './inputs.js';
import type { ExtractionMetrics, CandidateEvaluation } from './extraction-scoring.js';
import { HARD_CHECKS, type BriefingArmScore, type RatingPick } from './briefing-scoring.js';

// ---------------------------------------------------------------------------
// Rating sets
// ---------------------------------------------------------------------------

export interface RatingOption {
  label: string;
  type: 'text';
  content_md: string;
}

export interface RatingItem {
  id: string;
  context_md: string;
  options: RatingOption[];
}

export interface RatingSet {
  id: string;
  title: string;
  instructions: string;
  items: RatingItem[];
}

export interface RatingSets {
  project: 'city-monitor';
  sets: RatingSet[];
}

/** item id → option label → arm id */
export type RatingKey = Record<string, Record<string, string>>;

const LANGUAGE_TITLES: Record<string, string> = { de: 'German', en: 'English' };
const LABELS = ['A', 'B', 'C', 'D'];

/** mulberry32 seeded from the first 4 bytes of sha256(seed). */
function seededRandom(seed: string): () => number {
  let state = createHash('sha256').update(seed).digest().readUInt32BE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a PRNG seeded from the item id: deterministic, different per item. */
export function shuffleForItem<T>(itemId: string, values: readonly T[]): T[] {
  const out = [...values];
  const random = seededRandom(itemId);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function permutations(n: number): number[][] {
  if (n <= 1) return [Array.from({ length: n }, (_, i) => i)];
  return permutations(n - 1).flatMap((perm) =>
    Array.from({ length: n }, (_, at) => [...perm.slice(0, at), n - 1, ...perm.slice(at)]));
}

/**
 * Option order per item, as indices into that item's arm list. A hash per item
 * alone can repeat one order on most items of a small file (it did: 5 of 6), so
 * a rater could learn which slot holds which arm. Instead every ordering is used
 * equally often across the file, in a sequence shuffled by a seed from all item
 * ids: deterministic, and each arm lands in each slot about equally often.
 */
function balancedOrders(items: ReadonlyArray<{ id: string; size: number }>): number[][] {
  const seed = items.map((i) => i.id).join('|');
  const used = new Map<number, number>();
  return items.map(({ size }) => {
    const pool = shuffleForItem(`${seed}#${size}`, permutations(size));
    const k = used.get(size) ?? 0;
    used.set(size, k + 1);
    return pool[k % pool.length]!;
  });
}

function formatBerlinTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Berlin',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

function leakedTerms(text: string, forbiddenTerms: readonly string[]): string[] {
  const lower = text.toLowerCase();
  const hits = new Set<string>();
  for (const term of forbiddenTerms) if (lower.includes(term.toLowerCase())) hits.add(term.toLowerCase());
  for (const match of lower.matchAll(/gpt-\d/g)) hits.add(match[0]);
  if (lower.includes('openai')) hits.add('openai');
  return [...hits];
}

/**
 * No model names anywhere in the rating file. Ids, titles, instructions and
 * labels must be clean outright; an item's texts may repeat a name only if
 * the same string is in that item's input headlines (news about OpenAI).
 */
function assertNoModelNames(ratingSets: RatingSets, headlinesByItem: ReadonlyMap<string, string>, forbiddenTerms: readonly string[]): void {
  const structure = JSON.stringify({
    project: ratingSets.project,
    sets: ratingSets.sets.map((set) => ({
      id: set.id,
      title: set.title,
      instructions: set.instructions,
      items: set.items.map((item) => ({ id: item.id, labels: item.options.map((o) => o.label) })),
    })),
  });
  const structural = leakedTerms(structure, forbiddenTerms);
  if (structural.length > 0) throw new Error(`rating sets name a model in ids/titles/labels: ${structural.join(', ')}`);

  for (const item of ratingSets.sets.flatMap((set) => set.items)) {
    const headlines = (headlinesByItem.get(item.id) ?? '').toLowerCase();
    const texts = [item.context_md, ...item.options.map((o) => o.content_md)];
    const leaked = texts.flatMap((text) => leakedTerms(text, forbiddenTerms)).filter((term) => !headlines.includes(term));
    if (leaked.length > 0) throw new Error(`rating item ${item.id} names a model not in its headlines: ${leaked.join(', ')}`);
  }
}

export function buildRatingSets(source: {
  picks: readonly RatingPick[];
  briefing: (inputId: string, armId: string, lang: string) => string;
  context: (inputId: string) => { windowEnd: string; headlineList: string };
  forbiddenTerms: readonly string[];
}): { ratingSets: RatingSets; ratingKey: RatingKey } {
  const ratingKey: RatingKey = {};
  const headlinesByItem = new Map<string, string>();
  const langs = [...new Set(source.picks.map((p) => p.lang))];
  const setIdOf = (lang: string) => `city-monitor-briefing-${lang}`;
  const itemIdOf = (lang: string, i: number) => `${setIdOf(lang)}-${String(i + 1).padStart(2, '0')}`;

  const planned = langs.flatMap((lang) => source.picks.filter((p) => p.lang === lang)
    .map((pick, i) => ({ id: itemIdOf(lang, i), size: pick.armIds.length })));
  const orders = new Map(balancedOrders(planned).map((order, i) => [planned[i]!.id, order]));

  const sets = langs.map((lang): RatingSet => {
    const language = LANGUAGE_TITLES[lang] ?? lang;
    const setId = setIdOf(lang);
    const items = source.picks.filter((p) => p.lang === lang).map((pick, i): RatingItem => {
      const id = itemIdOf(lang, i);
      const { windowEnd, headlineList } = source.context(pick.inputId);
      headlinesByItem.set(id, headlineList);

      const order = orders.get(id)!.map((k) => pick.armIds[k]!);
      ratingKey[id] = Object.fromEntries(order.map((armId, j) => [LABELS[j]!, armId]));
      return {
        id,
        context_md: `Headlines given to the writer (Berlin, up to ${formatBerlinTime(windowEnd)}):\n\n${headlineList}`,
        options: order.map((armId, j) => ({ label: LABELS[j]!, type: 'text', content_md: source.briefing(pick.inputId, armId, lang) })),
      };
    });
    return {
      id: setId,
      title: `Berlin daily news briefing (${language})`,
      instructions: `Each option is a daily news briefing written from the headlines shown. Pick the one you would rather publish: accurate to the headlines with nothing invented, covering what matters most for Berlin, and reading naturally in ${language}.`,
      items,
    };
  });

  const ratingSets: RatingSets = { project: 'city-monitor', sets };
  assertNoModelNames(ratingSets, headlinesByItem, source.forbiddenTerms);
  return { ratingSets, ratingKey };
}

// ---------------------------------------------------------------------------
// results.md
// ---------------------------------------------------------------------------

export interface ExtractionSection {
  site: 'news' | 'police';
  baselineArm: string;
  /** Baseline first, then every candidate and fallback that ran. */
  metrics: ExtractionMetrics[];
  evaluations: CandidateEvaluation[];
  winner: string | null;
  fallbackRan: boolean;
  unusable: Record<string, string>;
}

export interface BriefingSection {
  inputs: Array<{ id: string; windowEnd: string; items: number }>;
  langs: string[];
  baselineArm: string;
  /** Ranked best first. */
  scores: BriefingArmScore[];
  picks: RatingPick[];
  ratedInputIds: string[];
  unusable: Record<string, string>;
}

export interface EvalReport {
  mode: 'full' | 'smoke';
  inputs: Pick<EvalInputs, 'fetchedAt' | 'sources'> & { newsCount: number; policeCount: number };
  news: ExtractionSection | null;
  police: ExtractionSection | null;
  briefing: BriefingSection | { skipped: string } | null;
  spend: { estimateUsd: number; actualUsd: number; priorUsd: number; capUsd: number; calls: number };
}

const pct = (v: number | undefined) => (v === undefined ? '–' : `${(v * 100).toFixed(1)}%`);
const usd = (v: number, digits = 4) => `$${v.toFixed(digits)}`;
const int = (v: number) => Math.round(v).toLocaleString('en-US');
const row = (cells: Array<string | number>) => `| ${cells.join(' | ')} |`;

function table(header: string[], rows: Array<Array<string | number>>): string {
  return [row(header), row(header.map(() => '---')), ...rows.map(row)].join('\n');
}

function extractionTable(section: ExtractionSection): string {
  const news = section.site === 'news';
  const header = [
    'Arm', 'Calls', 'API errors', 'Refusals', 'Truncated', 'Unparseable', 'Rejected responses', 'Missing items', 'of which left out',
    ...(news ? ['Invalid values'] : []), 'Junk labels',
    ...(news ? ['Relevance agr.', 'Category agr.', 'Importance flips', 'Briefing-eligible'] : []), 'Same label',
    'Label rate', 'Geocoded', 'On map', 'p50 / p95 ms', 'Tokens in / out (reasoning)', '$ / call', '$ / month',
  ];
  const rows = section.metrics.map((m) => [
    m.arm === section.baselineArm ? `${m.arm} (today)` : m.arm,
    m.calls, m.apiErrors, m.refusals, m.truncated, m.parseErrors, m.rejected, m.missing + m.duplicates, m.omitted,
    ...(news ? [m.invalidValues] : []), m.junkLabels,
    ...(news ? [pct(m.relevanceAgreement), pct(m.categoryAgreement), pct(m.importanceFlips), pct(m.briefingEligibleRate)] : []), pct(m.sameLabelRate),
    pct(m.labelRate), pct(m.geocodedRate), pct(m.onMapRate),
    `${int(m.p50Ms)} / ${int(m.p95Ms)}`,
    `${int(m.meanInTok)} / ${int(m.meanOutTok)} (${int(m.meanReasoningTok)})`,
    usd(m.costPerCall, 5), usd(m.costPerMonth, 2),
  ]);
  return table(header, rows);
}

function ruleLines(evaluations: CandidateEvaluation[]): string {
  return evaluations.map((e) => {
    const rules = e.rules.map((r) => `${r.id} ${r.pass ? 'pass' : '**fail**'} (${r.detail})`).join('; ');
    return `- \`${e.arm}\`: ${e.pass ? '**passes**' : 'fails'} — ${rules}`;
  }).join('\n');
}

function extractionSection(title: string, section: ExtractionSection | null, note: string): string {
  if (!section) return `## ${title}\n\nNot run.`;
  const unusable = Object.entries(section.unusable)
    .map(([arm, message]) => `- \`${arm}\` was unusable: its first call failed with \`${message}\`.`)
    .join('\n');
  const verdict = section.unusable[section.baselineArm]
    ? `**No decision.** The baseline \`${section.baselineArm}\` was unusable, so there was nothing to compare against. Rerun the eval.`
    : section.winner
      ? `**Winner: \`${section.winner}\`** — the first candidate, cheapest first, that passed every rule.`
      : `**No winner.** No candidate${section.fallbackRan ? ' or fallback' : ''} passed every rule. Keep \`${section.baselineArm}\` until someone reviews the numbers above.`;
  return [
    `## ${title}`,
    note,
    extractionTable(section),
    '"Missing items" counts items without an accepted verdict (failed calls, rejected responses, omitted or duplicate indices); "of which left out" is the part a successful response simply did not return. Rates are over all sample items.',
    section.site === 'news'
      ? '"Briefing-eligible" is the share of items marked relevant with importance 0.5 or above, the cut-off for the daily briefing. "Importance flips" counts items that cross that cut-off relative to the baseline, in either direction.'
      : 'Several models answer "no location" by leaving the report out rather than returning null — the prompt says to "omit the locationLabel field". Production marks a left-out report attempted exactly like a null one, so R1 does not count left-out police reports as defects.',
    '### Rules per candidate',
    ruleLines(section.evaluations),
    section.fallbackRan ? 'No GPT-6 candidate passed, so the gpt-5.6-luna fallback arms ran with the same rules.' : '',
    unusable,
    verdict,
  ].filter(Boolean).join('\n\n');
}

function briefingSection(briefing: EvalReport['briefing']): string {
  if (!briefing) return '## Daily briefing\n\nNot run.';
  if ('skipped' in briefing) return `## Daily briefing\n\n${briefing.skipped}`;

  const checkCell = (s: BriefingArmScore, lang: string) =>
    HARD_CHECKS.map((c) => (s.passRates[lang]?.[c] ?? 0) * 100).map((v) => v.toFixed(0)).join('/');
  const scoreTable = table(
    ['Rank', 'Arm', 'All 4 languages pass', ...briefing.langs.map((l) => `${l} present/lang/no-md/length %`), 'Two paragraphs', 'Invented numbers / text', 'Junk outputs', 'Failures', 'p50 / p95 ms', 'Tokens in / out (reasoning)', '$ / call', '$ / month'],
    briefing.scores.map((s, i) => [
      i + 1,
      s.arm === briefing.baselineArm ? `${s.arm} (today)` : s.arm,
      pct(s.allPassShare),
      ...briefing.langs.map((l) => checkCell(s, l)),
      pct(s.twoParagraphRate),
      s.meanUnknownNumbers.toFixed(2),
      s.junkOutputs,
      s.apiErrors + s.refusals + s.truncated + s.parseErrors,
      `${int(s.p50Ms)} / ${int(s.p95Ms)}`,
      `${int(s.meanInTok)} / ${int(s.meanOutTok)} (${int(s.meanReasoningTok)})`,
      usd(s.costPerCall),
      usd(s.costPerMonth, 2),
    ]),
  );

  const inputs = table(['Input', 'Window end (UTC)', 'Headlines'], briefing.inputs.map((i) => [i.id, i.windowEnd, i.items]));
  const picks = briefing.picks.length === 0
    ? 'No input had at least two eligible arms in both German and English, so there is nothing to rate.'
    : briefing.picks.map((p) => `- ${p.inputId} (${p.lang}): ${p.armIds.map((a) => `\`${a}\``).join(', ')}`).join('\n');
  const reviewedArms = [...new Set(briefing.picks.flatMap((p) => p.armIds))];
  const backTranslation = table(
    ['Arm', 'Input', 'Turkish: verdict', 'Turkish: evidence', 'Arabic: verdict', 'Arabic: evidence'],
    reviewedArms.flatMap((arm) => briefing.ratedInputIds.map((input) => [`\`${arm}\``, input, '_to fill_', '', '_to fill_', ''])),
  );
  const unusable = Object.entries(briefing.unusable)
    .map(([arm, message]) => `- \`${arm}\` was unusable: its first call failed with \`${message}\`.`)
    .join('\n');

  return [
    '## Daily briefing',
    'Inputs are rebuilt from the live sample: sliding 24-hour windows, classified by the chosen news arm, ordered and cut exactly as the summarize job does.',
    inputs,
    'Hard checks per language: present, right language, no Markdown, length (72–180 words for de/en, 54–180 for tr/ar). "All 4 languages pass" is the share of inputs where every language passes every hard check. Ranking: that share, then soft signals (two paragraphs, invented numbers, junk), then cost.',
    scoreTable,
    unusable,
    '### Sent to you for rating',
    'Each rated item shows today\'s gpt-5-mini, the best-ranked Luna arm and the best-ranked Sol arm (an arm that fails a hard check on that item is replaced by the next one of the same model, then the next overall). That answers the phase-2 question — Luna, Sol, or neither — which the three top-ranked arms overall might not, if they were three efforts of one model. Option order is shuffled per item; `rating-key.json` maps labels back to arms.',
    picks,
    '### Turkish and Arabic back-translation',
    'Filled in by the person running the eval, for the rated inputs and every arm shown in them: back-translate and compare with the same arm\'s English text and the headlines. Verdict: pass, minor issues or fail.',
    backTranslation,
    '### Phase-2 rule',
    'Choose the cheapest GPT-6 arm (Luna before Sol, lower effort first) that (1) passes the hard checks at least as often as the baseline, (2) passes the Turkish and Arabic back-translation on every reviewed input, and (3) you rate at least as well as the baseline. If no arm does, escalate — gpt-5.6-terra has not been tested.',
  ].filter(Boolean).join('\n\n');
}

function bottomLine(report: EvalReport): string {
  const extractionRow = (label: string, s: ExtractionSection | null) => {
    if (!s) return [label, 'not run', '–', '–'];
    const today = s.metrics.find((m) => m.arm === s.baselineArm);
    const winner = s.metrics.find((m) => m.arm === s.winner);
    return [
      label,
      s.winner ? `switch to \`${s.winner}\`` : `no winner — keep \`${s.baselineArm}\``,
      today ? usd(today.costPerMonth, 2) : '–',
      winner ? usd(winner.costPerMonth, 2) : '–',
    ];
  };
  const b = report.briefing;
  const briefingRow = !b || 'skipped' in b
    ? ['Daily briefing', b ? 'not rated (see below)' : 'not run', '–', '–']
    : [
      'Daily briefing',
      'awaits your rating',
      usd(b.scores.find((s) => s.arm === b.baselineArm)?.costPerMonth ?? 0, 2),
      b.scores.filter((s) => s.arm !== b.baselineArm).map((s) => `${s.arm} ${usd(s.costPerMonth, 2)}`).join(', '),
    ];
  const s = report.spend;
  return [
    table(['Call site', 'Decision', '$ / month today', '$ / month with decision'], [
      extractionRow('News classification', report.news),
      extractionRow('Police locations', report.police),
      briefingRow,
    ]),
    `API spend on this eval so far: ${usd(s.priorUsd + s.actualUsd, 2)} of the ${usd(s.capUsd, 2)} cap (this run ${usd(s.actualUsd, 4)}). Monthly figures are $ per call × the volume assumptions below; news is an upper bound.`,
  ].join('\n\n');
}

function methodSection(report: EvalReport): string {
  const src = report.inputs.sources;
  const feeds = src.feeds.map((f) => `${f.name} ${f.ok ? f.items : 'failed'}`).join(', ');
  const pricing = table(['Model', 'Input $/1M', 'Output $/1M'], [
    ...Object.entries(MODEL_PRICING).map(([model, p]) => [model, p.input.toFixed(2), p.output.toFixed(2)]),
    ['(other)', DEFAULT_PRICING.input.toFixed(2), DEFAULT_PRICING.output.toFixed(2)],
  ]);
  const volumeNotes: Record<SiteId, string> = {
    news: 'inventory estimate of 3k–4.5k filter calls; eval batches are full (10 items) while production averages ~2.5 new items per call, so $/month is an upper bound',
    police: 'one call per 10-minute run before the geo_attempted fix; lower after it',
    briefing: 'about 4 regenerations a day',
  };
  return [
    '## Samples and method',
    `- Fetched ${report.inputs.fetchedAt} from the live public sources, read-only.`,
    `- News: ${report.inputs.newsCount} items (newest across all Berlin feeds, in production order). Per feed: ${feeds}.`,
    `- Police: ${report.inputs.policeCount} reports — ${src.policeFeed} from the live feed, ${src.policeArchive ?? 0} from the berlin.de press-release archive (${src.archive ?? 'not used'}; title plus the release text the feed's description is cut from), ${src.policeDb} from the database top-up. Top-up: ${src.dbTopUp}.`,
    `- News is classified in batches of 10, as in production. Police reports go ${POLICE_CHUNK} per call; production sends every unplaced report of a run in one call, which after the geo_attempted fix is usually a handful, so ${POLICE_CHUNK} per call stands in for a normal run. The one-off backlog call right after deploy is not modelled.`,
    '- Labels are geocoded with the production geocoder (Nominatim, LocationIQ fallback); misses are retried once after clearing its cache so a provider hiccup is not scored against an arm. "On map" means inside Berlin\'s bounding box, which is what the frontend shows.',
    '- Every request is built by the production request builders and sent through the production call path; `@default` means no reasoning_effort is sent, as today.',
    `- Monthly volume assumptions: ${Object.entries(VOLUME).map(([site, v]) => `${site} ${int(v)} calls (${volumeNotes[site as SiteId]})`).join('; ')}.`,
    '',
    pricing,
    '',
    'Cost uses the reported token counts at these prices; the cached-input discount is ignored, so it slightly overstates cost.',
  ].join('\n');
}

export function renderResults(report: EvalReport): string {
  const s = report.spend;
  return [
    `# GPT-6 model eval — city-monitor${report.mode === 'smoke' ? ' (smoke run)' : ''}`,
    '## What was tested and why',
    'The snapshots behind today\'s gpt-5-nano and gpt-5-mini shut down on 2026-12-11. This eval runs the three LLM call sites — news classification, police-report locations and the four-language daily briefing — on today\'s models and on GPT-6 Luna and Sol, using live Berlin data. News and police are decided automatically by fixed rules; the briefing goes to you for a blind rating.',
    '## Bottom line',
    bottomLine(report),
    extractionSection('News classification', report.news, 'Baseline is today\'s `gpt-5-nano`; candidates cheapest first. Agreement columns compare with the baseline over the items both returned.'),
    extractionSection('Police locations', report.police, 'Baseline is today\'s `gpt-5-nano`; candidates cheapest first.'),
    briefingSection(report.briefing),
    methodSection(report),
    '## Spend',
    `This run: estimated ${usd(s.estimateUsd, 2)} (worst case), actual ${usd(s.actualUsd, 4)} over ${s.calls} calls. Cumulative: ${usd(s.priorUsd + s.actualUsd, 4)} of the ${usd(s.capUsd, 2)} cap.`,
    '',
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Turkish / Arabic review sheet
// ---------------------------------------------------------------------------

export function renderTrArReview(
  inputs: readonly BriefingInput[],
  headlineLists: ReadonlyMap<string, string>,
  armIds: readonly string[],
  briefing: (inputId: string, armId: string, lang: string) => string | undefined,
  ratedInputIds: readonly string[],
): string {
  const sections = inputs.map((input) => {
    const arms = armIds.map((arm) => [
      `### \`${arm}\``,
      `**English**\n\n${briefing(input.id, arm, 'en') ?? '_(no output)_'}`,
      `**Turkish**\n\n${briefing(input.id, arm, 'tr') ?? '_(no output)_'}`,
      `**Arabic**\n\n${briefing(input.id, arm, 'ar') ?? '_(no output)_'}`,
    ].join('\n\n'));
    return [
      `## ${input.id} — window ending ${input.windowEnd}${ratedInputIds.includes(input.id) ? ' (rated — review this one)' : ''}`,
      '**Headlines**',
      headlineLists.get(input.id) ?? '',
      ...arms,
    ].join('\n\n');
  });
  return ['# Turkish and Arabic review sheet', 'Back-translate each Turkish and Arabic briefing of the rated inputs and compare it with the same arm\'s English text and the headlines: added or dropped facts, wrong language or script, broken sentences, mangled names. Record the verdicts in results.md.', ...sections, ''].join('\n\n');
}

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

/** Write files (relative path → content) under `dir`, creating folders as needed. */
export async function writeDeliverable(dir: string, files: Record<string, string>): Promise<void> {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(dir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
}
