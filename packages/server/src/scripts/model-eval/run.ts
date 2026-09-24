/**
 * Model eval CLI for the GPT-6 migration (see .context/model-eval.md).
 *
 *   npm run eval:models --workspace=packages/server -- --out ../../DOCS/<folder> [--dry-run] [--reuse-inputs] [--budget-usd 5] [--smoke]
 *
 * Runs news classification, police locations and the briefing on their arms,
 * decides the two extraction sites automatically, and writes results.md plus
 * blind rating sets for the briefing. Reads live public data; the only DB
 * access is an optional SELECT. Never writes to a database.
 */

import { appendFileSync } from 'node:fs';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { berlin } from '../../config/cities/berlin.js';
import { createLogger } from '../../lib/logger.js';
import { isConfigured, LLM_BATCH_SIZE, stripBareCityLabel } from '../../lib/openai.js';
import { buildFilterRequest, buildGeoRequest, buildBriefingRequest, type BriefingResult } from '../../lib/llm-prompts.js';
import {
  ARMS, VOLUME, POLICE_CHUNK, armsFor, baselineOf, armKey, estimateRunCost, runArm, geocodeLabels,
  type Arm, type CallRecord, type EvalRequest, type SiteId,
} from './arms.js';
import { collectInputs, buildBriefingInputs, type EvalInputs, type BriefingInput } from './inputs.js';
import {
  collectVerdicts, scoreExtraction, decideExtraction, normalizeVerdict,
  type ExtractionResponse, type ExtractionItem, type ExtractionScore, type GeoPoint,
} from './extraction-scoring.js';
import { checkBriefing, scoreBriefingArms, selectRatingArms, type BriefingOutcome, type RatingPick } from './briefing-scoring.js';
import { buildRatingSets, renderResults, renderTrArReview, writeDeliverable, type EvalReport, type ExtractionSection, type BriefingSection } from './deliverable.js';
import { createBudget, readSpendLog, appendSpendLog, BudgetExceededError, type Budget } from './budget.js';

const log = createLogger('model-eval');

const SERVER_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const MAX_BRIEFING_INPUTS = 6;
const MIN_BRIEFING_INPUTS = 3;
/** Smoke run: one call per extraction arm, one briefing input, no fallbacks. */
const SMOKE_LIMITS = { news: LLM_BATCH_SIZE, police: POLICE_CHUNK };

interface Cli {
  out: string;
  dryRun: boolean;
  reuseInputs: boolean;
  budgetUsd: number;
  smoke: boolean;
}

function parseCli(argv: string[]): Cli {
  const { values } = parseArgs({
    args: argv,
    options: {
      out: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'reuse-inputs': { type: 'boolean', default: false },
      'budget-usd': { type: 'string', default: '5' },
      smoke: { type: 'boolean', default: false },
    },
    strict: true,
  });
  const budgetUsd = Number(values['budget-usd']);
  if (!values.out) throw new Error('--out <folder> is required (relative to packages/server)');
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('--budget-usd must be a positive number');
  return { out: values.out, dryRun: values['dry-run'], reuseInputs: values['reuse-inputs'], budgetUsd, smoke: values.smoke };
}

/** Arms this run may call, in run order. Smoke: no fallbacks, briefing baseline + first Luna + first Sol. */
function plannedArms(smoke: boolean): Arm[] {
  if (!smoke) return [...ARMS.news, ...ARMS.police, ...ARMS.briefing];
  const firstOf = (model: string) => ARMS.briefing.find((a) => a.target.model === model)!;
  return [
    ...ARMS.news.filter((a) => a.role !== 'fallback'),
    ...ARMS.police.filter((a) => a.role !== 'fallback'),
    baselineOf('briefing'), firstOf('gpt-6-luna'), firstOf('gpt-6-sol'),
  ];
}

interface RunContext {
  budget: Budget;
  planned: Arm[];
  onRecord: (record: CallRecord) => void;
  geo: Map<string, GeoPoint | null>;
}

async function runArms<T extends Record<string, unknown>>(
  arms: readonly Arm[],
  requests: readonly EvalRequest<T>[],
  ctx: RunContext,
): Promise<Map<string, { records: CallRecord<T>[]; unusable?: string }>> {
  const runs = new Map<string, { records: CallRecord<T>[]; unusable?: string }>();
  for (const a of arms) {
    ctx.budget.startArm(armKey(a));
    runs.set(a.id, await runArm(a, requests, ctx.onRecord));
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Extraction sites
// ---------------------------------------------------------------------------

function extractionRequests(site: 'news' | 'police', inputs: EvalInputs): EvalRequest<ExtractionResponse>[] {
  const chunk = <T>(list: readonly T[], size: number) =>
    Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
  const pad = (i: number) => String(i).padStart(3, '0');

  if (site === 'news') {
    return chunk(inputs.news, LLM_BATCH_SIZE).map((batch, i) => ({
      requestId: `news-${pad(i)}`,
      inputIds: batch.map((item) => item.id),
      request: buildFilterRequest(berlin.name, batch.map((item) => ({ title: item.title, description: item.description, sourceName: item.sourceName }))),
    }));
  }
  return chunk(inputs.police, POLICE_CHUNK).map((batch, i) => ({
    requestId: `police-${pad(i)}`,
    inputIds: batch.map((report) => report.id),
    request: buildGeoRequest(berlin.name, batch.map((report) => ({ title: report.title, description: report.description }))),
  }));
}

async function runExtractionSite(
  site: 'news' | 'police',
  inputs: EvalInputs,
  ctx: RunContext,
): Promise<{ section: ExtractionSection; winnerVerdicts: Map<string, ExtractionItem> }> {
  const requests = extractionRequests(site, inputs);
  const n = site === 'news' ? inputs.news.length : inputs.police.length;
  const plannedKeys = new Set(ctx.planned.map(armKey));
  const baseline = baselineOf(site);
  const candidates = armsFor(site, 'candidate');
  const fallbacks = armsFor(site, 'fallback').filter((a) => plannedKeys.has(armKey(a)));
  const scoring = { n, cityName: berlin.name, bbox: berlin.boundingBox, geo: ctx.geo, volume: VOLUME[site] };
  const cityLower = berlin.name.toLowerCase();

  const runs = new Map<string, { records: CallRecord<ExtractionResponse>[]; unusable?: string }>();
  const runAndGeocode = async (arms: Arm[]) => {
    for (const [id, run] of await runArms(arms, requests, ctx)) runs.set(id, run);
    const labels = arms.flatMap((a) => [...collectVerdicts(runs.get(a.id)!.records, n).verdicts.values()]
      .map((item) => stripBareCityLabel(item.locationLabel, cityLower))
      .filter((label): label is string => !!label));
    await geocodeLabels(labels, berlin.name, ctx.geo);
  };

  await runAndGeocode([baseline, ...candidates]);
  const baseScore = scoreExtraction(site, baseline.id, runs.get(baseline.id)!.records, scoring);
  const score = (a: Arm): ExtractionScore => scoreExtraction(site, a.id, runs.get(a.id)!.records, scoring, baseScore.verdicts);

  const scores = candidates.map(score);
  let decision = decideExtraction(site, baseScore.metrics, scores.map((s) => s.metrics));
  let fallbackRan = false;
  const baselineUnusable = !!runs.get(baseline.id)!.unusable;
  if (baselineUnusable) {
    // Nothing to compare against — no candidate may win by default.
    decision = { ...decision, winner: null };
    ctx.budget.skip(fallbacks.map(armKey));
  } else if (!decision.winner && fallbacks.length > 0) {
    fallbackRan = true;
    await runAndGeocode(fallbacks);
    const fallbackScores = fallbacks.map(score);
    scores.push(...fallbackScores);
    const fallbackDecision = decideExtraction(site, baseScore.metrics, fallbackScores.map((s) => s.metrics));
    decision = { winner: fallbackDecision.winner, evaluations: [...decision.evaluations, ...fallbackDecision.evaluations] };
  } else {
    ctx.budget.skip(fallbacks.map(armKey));
  }

  const winner = scores.find((s) => s.metrics.arm === decision.winner);
  log.info(`${site}: ${decision.winner ? `winner ${decision.winner}` : 'no winner'}`);
  return {
    section: {
      site,
      baselineArm: baseline.id,
      metrics: [baseScore.metrics, ...scores.map((s) => s.metrics)],
      evaluations: decision.evaluations,
      winner: decision.winner,
      fallbackRan,
      unusable: Object.fromEntries([...runs].flatMap(([id, run]) => (run.unusable ? [[id, run.unusable]] : []))),
    },
    winnerVerdicts: (winner ?? baseScore).verdicts,
  };
}

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------

function briefingInputsFor(inputs: EvalInputs, newsVerdicts: ReadonlyMap<string, ExtractionItem>, smoke: boolean): BriefingInput[] {
  const verdicts = new Map([...newsVerdicts].map(([id, item]) => [id, normalizeVerdict(item)]));
  const built = buildBriefingInputs(inputs.news, verdicts, new Date(inputs.fetchedAt));
  if (!smoke) return built.slice(0, MAX_BRIEFING_INPUTS);
  // A 10-item smoke sample rarely fills a window; fall back to the sample itself.
  return built.length > 0
    ? built.slice(0, 1)
    : [{ id: 'in1', windowEnd: inputs.fetchedAt, items: inputs.news.slice(0, 10).map((i) => ({ title: i.title, description: i.description })) }];
}

function messageText(content: unknown): string {
  return typeof content === 'string' ? content : JSON.stringify(content);
}

function findOutcome(outcomes: readonly BriefingOutcome[], armId: string, inputId: string): BriefingOutcome | undefined {
  return outcomes.find((o) => o.arm === armId && o.inputId === inputId);
}

/** Rating sets + key (when anything is rated), every arm's briefings, and the tr/ar review sheet. */
function briefingFiles(args: {
  briefingInputs: readonly BriefingInput[];
  arms: readonly Arm[];
  outcomes: readonly BriefingOutcome[];
  headlineLists: ReadonlyMap<string, string>;
  picks: readonly RatingPick[];
  ratedInputIds: readonly string[];
}): Record<string, string> {
  const { briefingInputs, arms, outcomes, headlineLists, picks, ratedInputIds } = args;
  const textOf = (inputId: string, armId: string, lang: string) => findOutcome(outcomes, armId, inputId)?.record.parsed?.briefings[lang];
  const files: Record<string, string> = {};

  if (picks.length > 0) {
    const windowEnds = new Map(briefingInputs.map((i) => [i.id, i.windowEnd]));
    const { ratingSets, ratingKey } = buildRatingSets({
      picks,
      briefing: (inputId, armId, lang) => textOf(inputId, armId, lang) ?? '',
      context: (inputId) => ({ windowEnd: windowEnds.get(inputId)!, headlineList: headlineLists.get(inputId)! }),
      forbiddenTerms: [...new Set(Object.values(ARMS).flat().map((a) => a.target.model))],
    });
    files['rating-sets.json'] = JSON.stringify(ratingSets, null, 2);
    files['rating-key.json'] = JSON.stringify(ratingKey, null, 2);
  }

  files['data/briefings.json'] = JSON.stringify(Object.fromEntries(briefingInputs.map((input) => [input.id, {
    windowEnd: input.windowEnd,
    headlines: headlineLists.get(input.id),
    arms: Object.fromEntries(arms.map((a) => {
      const record = findOutcome(outcomes, a.id, input.id)?.record;
      return [a.id, record?.parsed?.briefings ?? { error: record?.error ?? 'not run', message: record?.errorMessage }];
    })),
  }])), null, 2);
  files['data/tr-ar-review.md'] = renderTrArReview(briefingInputs, headlineLists, arms.map((a) => a.id), textOf, ratedInputIds);
  return files;
}

async function runBriefingSite(
  inputs: EvalInputs,
  newsVerdicts: ReadonlyMap<string, ExtractionItem>,
  ctx: RunContext,
  smoke: boolean,
  files: Record<string, string>,
): Promise<BriefingSection | { skipped: string }> {
  const briefingInputs = briefingInputsFor(inputs, newsVerdicts, smoke);
  const arms = ctx.planned.filter((a) => a.site === 'briefing');
  if (briefingInputs.length < (smoke ? 1 : MIN_BRIEFING_INPUTS)) {
    ctx.budget.skip(arms.map(armKey));
    const skipped = `Only ${briefingInputs.length} briefing input(s) could be built from the sample (at least ${MIN_BRIEFING_INPUTS} needed), so the briefing arms were not run. The extraction results above stand; rerun later with a fuller news sample.`;
    log.warn(skipped);
    return { skipped };
  }

  const langs = berlin.languages;
  const requests: EvalRequest<BriefingResult>[] = briefingInputs.map((input) => ({
    requestId: `briefing-${input.id}`,
    inputIds: [input.id],
    request: buildBriefingRequest(berlin.name, input.items, langs),
  }));
  const headlineLists = new Map(requests.map((r) => [r.inputIds[0]!, messageText(r.request.messages[1]?.content)]));

  const runs = await runArms(arms, requests, ctx);
  const outcomes: BriefingOutcome[] = [...runs.values()].flatMap((run) => run.records).map((record) => {
    const inputId = record.inputIds[0]!;
    const briefings = record.parsed?.briefings;
    return {
      arm: record.arm,
      inputId,
      record,
      checks: briefings
        ? Object.fromEntries(langs.map((lang) => [lang, checkBriefing(lang, briefings[lang], headlineLists.get(inputId) ?? '')]))
        : null,
    };
  });

  const inputIds = briefingInputs.map((i) => i.id);
  const baseline = baselineOf('briefing');
  const scores = scoreBriefingArms(arms.map((a) => ({ id: a.id, model: a.target.model })), outcomes, inputIds, langs, VOLUME.briefing);
  const picks = selectRatingArms({
    inputIds,
    ranked: scores.map((s) => ({ arm: s.arm, model: s.model })),
    baselineArm: baseline.id,
    eligible: (inputId, lang, armId) => findOutcome(outcomes, armId, inputId)?.checks?.[lang]?.hardPass === true,
  });
  const ratedInputIds = [...new Set(picks.map((p) => p.inputId))];
  Object.assign(files, briefingFiles({ briefingInputs, arms, outcomes, headlineLists, picks, ratedInputIds }));

  return {
    inputs: briefingInputs.map((i) => ({ id: i.id, windowEnd: i.windowEnd, items: i.items.length })),
    langs,
    baselineArm: baseline.id,
    scores,
    picks,
    ratedInputIds,
    unusable: Object.fromEntries([...runs].flatMap(([id, run]) => (run.unusable ? [[id, run.unusable]] : []))),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function loadOrCollectInputs(cli: Cli, dataDir: string): Promise<EvalInputs> {
  if (cli.reuseInputs) {
    log.info('reusing data/inputs.json');
    return JSON.parse(await readFile(path.join(dataDir, 'inputs.json'), 'utf8')) as EvalInputs;
  }
  const inputs = await collectInputs(cli.smoke ? SMOKE_LIMITS : {});
  await writeDeliverable(dataDir, { 'inputs.json': JSON.stringify(inputs, null, 2) });
  return inputs;
}

async function main(): Promise<number> {
  const cli = parseCli(process.argv.slice(2));
  const outDir = path.resolve(SERVER_ROOT, cli.out);
  const runDir = cli.smoke ? path.join(outDir, 'smoke') : outDir;
  const dataDir = path.join(runDir, 'data');
  const spendLogPath = path.join(outDir, 'data', 'spend-log.json');

  if (!cli.dryRun && !isConfigured()) {
    log.error('OPENAI_API_KEY not set');
    return 1;
  }

  const inputs = await loadOrCollectInputs(cli, dataDir);
  const planned = plannedArms(cli.smoke);
  const callsPerSite: Record<SiteId, number> = {
    news: Math.ceil(inputs.news.length / LLM_BATCH_SIZE),
    police: Math.ceil(inputs.police.length / POLICE_CHUNK),
    briefing: cli.smoke ? 1 : MAX_BRIEFING_INPUTS,
  };
  const estimate = estimateRunCost(callsPerSite, planned);
  const priorUsd = (await readSpendLog(spendLogPath)).reduce((sum, e) => sum + e.actualUsd, 0);
  log.info(`sample: ${inputs.news.length} news items, ${inputs.police.length} police reports (DB top-up: ${inputs.sources.dbTopUp})`);
  log.info(`worst-case estimate $${estimate.total.toFixed(4)} for ${planned.length} arms; spent so far $${priorUsd.toFixed(4)}; cap $${cli.budgetUsd.toFixed(2)}`);
  if (cli.dryRun) return 0;

  const budget = createBudget({ capUsd: cli.budgetUsd, priorUsd, estimates: estimate.perArm });
  try {
    budget.checkTotal();
  } catch (err) {
    log.error((err as Error).message);
    return 1;
  }

  // A previous run's rating files must never outlive a run that produces none.
  await rm(path.join(runDir, 'rating-sets.json'), { force: true });
  await rm(path.join(runDir, 'rating-key.json'), { force: true });
  const callsFile = path.join(dataDir, 'calls.jsonl');
  await writeFile(callsFile, '');

  const ctx: RunContext = {
    budget,
    planned,
    geo: new Map(),
    onRecord: (record) => {
      budget.record(record.costUsd);
      appendFileSync(callsFile, JSON.stringify(record) + '\n');
    },
  };

  const files: Record<string, string> = {};
  const report: EvalReport = {
    mode: cli.smoke ? 'smoke' : 'full',
    inputs: { fetchedAt: inputs.fetchedAt, sources: inputs.sources, newsCount: inputs.news.length, policeCount: inputs.police.length },
    news: null,
    police: null,
    briefing: null,
    spend: { estimateUsd: estimate.total, actualUsd: 0, priorUsd, capUsd: cli.budgetUsd, calls: 0 },
  };

  const startedAt = new Date().toISOString();
  let exitCode = 0;
  try {
    const news = await runExtractionSite('news', inputs, ctx);
    report.news = news.section;
    report.police = (await runExtractionSite('police', inputs, ctx)).section;
    report.briefing = await runBriefingSite(inputs, news.winnerVerdicts, ctx, cli.smoke, files);
  } catch (err) {
    if (!(err instanceof BudgetExceededError)) throw err;
    log.error(`${err.message} — stopping`);
    exitCode = 1;
  } finally {
    await appendSpendLog(spendLogPath, {
      startedAt, mode: report.mode, estimateUsd: estimate.total, actualUsd: budget.spentUsd, calls: budget.calls,
    });
  }

  report.spend = { ...report.spend, actualUsd: budget.spentUsd, calls: budget.calls };
  files['results.md'] = renderResults(report);
  await writeDeliverable(runDir, files);
  log.info(`done: ${budget.calls} calls, $${budget.spentUsd.toFixed(4)} — wrote ${Object.keys(files).join(', ')} to ${runDir}`);
  return exitCode;
}

main().then(
  (code) => { process.exitCode = code; },
  (err: unknown) => {
    log.error('model eval failed', err);
    process.exitCode = 1;
  },
);
