/**
 * Scoring for the multilingual briefing: hard checks per language (present,
 * right language, no Markdown, length) and soft signals, ranking of the arms,
 * and the choice of which arms go to the owner's blind rating.
 */

import type { BriefingResult } from '../../lib/llm-prompts.js';
import type { CallRecord } from './arms.js';
import { callStats, hasJunkCharacters, mean, ratio, type CallStats } from './call-stats.js';

// ---------------------------------------------------------------------------
// Checks per language
// ---------------------------------------------------------------------------

type StopWordLang = 'de' | 'en' | 'tr';

// Words shared between the languages ("in", "was", "die", "her", ...) are left out.
const STOP_WORDS: Record<StopWordLang, ReadonlySet<string>> = {
  de: new Set(['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'von', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'auf', 'für', 'sich', 'auch', 'im', 'zu', 'bei', 'wird', 'werden', 'nach', 'über', 'aus', 'dass', 'wurde', 'sind', 'hat']),
  en: new Set(['the', 'and', 'is', 'of', 'to', 'for', 'with', 'on', 'are', 'this', 'that', 'from', 'by', 'at', 'as', 'it', 'has', 'have', 'be', 'been', 'were', 'their', 'its', 'which', 'after']),
  tr: new Set(['ve', 'bir', 'bu', 'için', 'ile', 'olarak', 'daha', 'çok', 'olan', 'ise', 'gibi', 'sonra', 'kadar', 'ancak', 'veya', 'ama', 'yeni', 'göre', 'değil']),
};

const TURKISH_ONLY_LETTERS = /[çğışİÇĞŞ]/g;

function stopWordCounts(text: string): Record<StopWordLang, number> {
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  const count = (lang: StopWordLang) => words.filter((w) => STOP_WORDS[lang].has(w)).length;
  return { de: count('de'), en: count('en'), tr: count('tr') };
}

function isRightLanguage(lang: string, text: string): boolean {
  if (lang === 'ar') {
    const letters = text.match(/\p{L}/gu) ?? [];
    const arabic = letters.filter((ch) => /\p{Script=Arabic}/u.test(ch));
    return letters.length > 0 && arabic.length / letters.length >= 0.6;
  }
  const counts = stopWordCounts(text);
  if (lang === 'tr') {
    const turkishLetters = (text.match(TURKISH_ONLY_LETTERS) ?? []).length;
    return turkishLetters >= 2 && counts.tr > counts.de && counts.tr > counts.en;
  }
  if (lang === 'de') return counts.de > counts.en && counts.de > counts.tr;
  if (lang === 'en') return counts.en > counts.de && counts.en > counts.tr;
  return true;
}

/**
 * Markdown the frontend would show raw. A single line starting "1." is allowed
 * ("1. FC Union ..."); two or more numbered lines are a list.
 */
function hasMarkdown(text: string): boolean {
  if (text.includes('**')) return true;
  const lines = text.split('\n').map((line) => line.trim());
  if (lines.some((line) => /^[-*•+](\s|$)/.test(line) || /^#{1,6}\s/.test(line) || line.startsWith('>') || line.startsWith('|'))) {
    return true;
  }
  return lines.filter((line) => /^\d+[.)]\s/.test(line)).length >= 2;
}

export interface WordRange {
  min: number;
  max: number;
}

/**
 * The briefing length the owner wants, per language. The prompt asks for less
 * (`BRIEFING_PROMPT_WORDS`) because GPT-6 Luna overshoots what it is asked for.
 */
export const WANTED_WORDS = { target: 160, min: 140, max: 190 } as const;

/**
 * Hard length bounds around the wanted length: 0.6–1.5× for German and
 * English. Turkish and Arabic use fewer, longer words, so every other
 * language gets a floor of 0.45×. These catch broken output; the wanted band
 * itself is judged from the word-range column.
 */
export function lengthBounds(lang: string): WordRange {
  const floor = lang === 'de' || lang === 'en' ? 0.6 : 0.45;
  return { min: Math.round(WANTED_WORDS.target * floor), max: Math.round(WANTED_WORDS.target * 1.5) };
}

export interface BriefingCheck {
  present: boolean;
  rightLanguage: boolean;
  noMarkdown: boolean;
  lengthOk: boolean;
  /** All four checks above. */
  hardPass: boolean;
  words: number;
  /** Blocks separated by a blank line — the dashboard (BriefingStrip) splits paragraphs only there. */
  paragraphs: number;
  /** de/en only: numbers that do not occur in the source text. */
  unknownNumbers: string[];
  junk: boolean;
}

export const HARD_CHECKS = ['present', 'rightLanguage', 'noMarkdown', 'lengthOk'] as const;
export type HardCheck = typeof HARD_CHECKS[number];

/** `sourceText`: everything the writer was given that may carry numbers — headlines and the prompt's date line. */
export function checkBriefing(lang: string, text: string | undefined, sourceText: string): BriefingCheck {
  const body = (text ?? '').trim();
  const present = body !== '' && body !== '-';
  const words = body === '' ? 0 : body.split(/\s+/).length;
  const bounds = lengthBounds(lang);

  const sourceNumbers = new Set(sourceText.match(/\d+/g) ?? []);
  const unknownNumbers = lang === 'de' || lang === 'en'
    ? [...new Set(body.match(/\d+/g) ?? [])].filter((num) => !sourceNumbers.has(num))
    : [];

  const check = {
    present,
    rightLanguage: present && isRightLanguage(lang, body),
    noMarkdown: !hasMarkdown(body),
    lengthOk: words >= bounds.min && words <= bounds.max,
    words,
    paragraphs: body.split(/\n\s*\n/).filter((p) => p.trim() !== '').length,
    unknownNumbers,
    junk: hasJunkCharacters(body, true),
  };
  return { ...check, hardPass: check.present && check.rightLanguage && check.noMarkdown && check.lengthOk };
}

// ---------------------------------------------------------------------------
// Arm scoring and ranking
// ---------------------------------------------------------------------------

export interface BriefingOutcome {
  arm: string;
  inputId: string;
  record: CallRecord<BriefingResult>;
  /** Per-language checks; null when the call failed. */
  checks: Record<string, BriefingCheck> | null;
}

export interface BriefingArmScore extends CallStats {
  arm: string;
  model: string;
  calls: number;
  /** Share of inputs on which every language passes every hard check. */
  allPassShare: number;
  /** Pass rate per language and hard check, over all inputs. */
  passRates: Record<string, Record<HardCheck, number>>;
  /** Shortest and longest text per language; null when no input produced one. */
  wordRange: Record<string, WordRange | null>;
  twoParagraphRate: number;
  meanUnknownNumbers: number;
  junkOutputs: number;
  /** Lower is better: missed two-paragraph shape + junk rate + 0.1 × invented-number rate. */
  softPenalty: number;
  costPerMonth: number;
}

function scoreBriefingArm(
  arm: { id: string; model: string },
  outcomes: readonly BriefingOutcome[],
  inputIds: readonly string[],
  langs: readonly string[],
  volume: number,
): BriefingArmScore {
  const mine = outcomes.filter((o) => o.arm === arm.id);
  const checksFor = (inputId: string) => mine.find((o) => o.inputId === inputId)?.checks ?? null;
  const allChecks = inputIds.flatMap((id) => langs.map((lang) => checksFor(id)?.[lang] ?? null));
  const outputs = allChecks.length;
  const deEnChecks = inputIds.flatMap((id) => ['de', 'en'].filter((l) => langs.includes(l)).map((l) => checksFor(id)?.[l] ?? null));

  const passRates = Object.fromEntries(langs.map((lang) => [
    lang,
    Object.fromEntries(HARD_CHECKS.map((check) => [
      check,
      ratio(inputIds.filter((id) => checksFor(id)?.[lang]?.[check] === true).length, inputIds.length),
    ])) as Record<HardCheck, number>,
  ]));

  const wordRange = Object.fromEntries(langs.map((lang) => {
    const counts = inputIds.flatMap((id) => {
      const check = checksFor(id)?.[lang];
      return check?.present ? [check.words] : [];
    });
    return [lang, counts.length > 0 ? { min: Math.min(...counts), max: Math.max(...counts) } : null];
  }));

  const twoParagraphRate = ratio(allChecks.filter((c) => c?.paragraphs === 2).length, outputs);
  const junkOutputs = allChecks.filter((c) => c?.junk).length;
  const meanUnknownNumbers = mean(deEnChecks.map((c) => c?.unknownNumbers.length ?? 0));
  const stats = callStats(mine.map((o) => o.record));

  return {
    arm: arm.id,
    model: arm.model,
    calls: mine.length,
    ...stats,
    allPassShare: ratio(inputIds.filter((id) => langs.every((lang) => checksFor(id)?.[lang]?.hardPass === true)).length, inputIds.length),
    passRates,
    wordRange,
    twoParagraphRate,
    meanUnknownNumbers,
    junkOutputs,
    softPenalty: (1 - twoParagraphRate) + ratio(junkOutputs, outputs) + 0.1 * meanUnknownNumbers,
    costPerMonth: stats.costPerCall * volume,
  };
}

/** Score every arm and rank: all-language pass share, then soft signals, then lower cost. */
export function scoreBriefingArms(
  arms: ReadonlyArray<{ id: string; model: string }>,
  outcomes: readonly BriefingOutcome[],
  inputIds: readonly string[],
  langs: readonly string[],
  volume: number,
): BriefingArmScore[] {
  return arms
    .map((arm) => scoreBriefingArm(arm, outcomes, inputIds, langs, volume))
    .sort((a, b) =>
      b.allPassShare - a.allPassShare
      || a.softPenalty - b.softPenalty
      || a.costPerCall - b.costPerCall);
}

// ---------------------------------------------------------------------------
// Rating selection
// ---------------------------------------------------------------------------

export interface RatingPick {
  inputId: string;
  lang: string;
  armIds: string[];
}

function modelFamily(model: string): string {
  if (model.includes('luna')) return 'luna';
  if (model.includes('sol')) return 'sol';
  return model;
}

/**
 * Per item: today's baseline, the best-ranked Luna arm and the best-ranked Sol
 * arm. An ineligible pick is replaced by the next eligible arm of the same
 * model, else the next eligible arm overall. Rated inputs are the first
 * `maxInputs` (newest first) with at least two eligible options in every
 * rated language.
 */
export function selectRatingArms(opts: {
  inputIds: readonly string[];
  ranked: ReadonlyArray<{ arm: string; model: string }>;
  baselineArm: string;
  eligible: (inputId: string, lang: string, armId: string) => boolean;
  langs?: readonly string[];
  maxInputs?: number;
}): RatingPick[] {
  const { inputIds, ranked, baselineArm, eligible, langs = ['de', 'en'], maxInputs = 3 } = opts;
  const baseline = ranked.find((r) => r.arm === baselineArm);
  const bestOfFamily = (family: string) => ranked.find((r) => r.arm !== baselineArm && modelFamily(r.model) === family);
  const targets = [baseline, bestOfFamily('luna'), bestOfFamily('sol')].filter((t): t is { arm: string; model: string } => !!t);

  const pickFor = (inputId: string, lang: string): string[] => {
    const picked: string[] = [];
    const available = (armId: string) => !picked.includes(armId) && eligible(inputId, lang, armId);
    for (const target of targets) {
      const choice = available(target.arm)
        ? target.arm
        : ranked.find((r) => r.model === target.model && available(r.arm))?.arm
          ?? ranked.find((r) => available(r.arm))?.arm;
      if (choice) picked.push(choice);
    }
    return picked;
  };

  const picks: RatingPick[] = [];
  let rated = 0;
  for (const inputId of inputIds) {
    if (rated >= maxInputs) break;
    const perLang = langs.map((lang) => ({ inputId, lang, armIds: pickFor(inputId, lang) }));
    if (perLang.some((p) => p.armIds.length < 2)) continue;
    picks.push(...perLang);
    rated++;
  }
  return picks;
}
