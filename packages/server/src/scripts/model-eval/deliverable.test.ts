import { describe, it, expect } from 'vitest';
import { buildRatingSets, shuffleForItem } from './deliverable.js';
import type { RatingPick } from './briefing-scoring.js';

const ARMS = ['gpt-5-mini@default', 'gpt-6-luna@medium', 'gpt-6-sol@low'];
const FORBIDDEN = ['gpt-5-mini', 'gpt-6-luna', 'gpt-6-sol'];

function picksFor(inputIds: string[], armIds = ARMS): RatingPick[] {
  return inputIds.flatMap((inputId) => ['de', 'en'].map((lang) => ({ inputId, lang, armIds })));
}

function build(picks: RatingPick[], opts: { text?: (input: string, arm: string, lang: string) => string; headlines?: string } = {}) {
  return buildRatingSets({
    picks,
    briefing: opts.text ?? ((input, arm, lang) => `Briefing ${input} ${lang} from ${ARMS.indexOf(arm)}`),
    context: () => ({ windowEnd: '2026-09-24T10:00:00.000Z', headlineList: opts.headlines ?? '1. Senat beschließt Haushalt' }),
    forbiddenTerms: FORBIDDEN,
  });
}

describe('shuffleForItem', () => {
  it('gives the same permutation for the same item id', () => {
    const a = shuffleForItem('city-monitor-briefing-de-01', ARMS);
    const b = shuffleForItem('city-monitor-briefing-de-01', ARMS);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([...ARMS].sort());
  });
});

describe('buildRatingSets', () => {
  const { ratingSets, ratingKey } = build(picksFor(['in1', 'in2', 'in3']));
  const items = ratingSets.sets.flatMap((s) => s.items);

  it('produces one German and one English set with numbered item ids', () => {
    expect(ratingSets.project).toBe('city-monitor');
    expect(ratingSets.sets.map((s) => s.id)).toEqual(['city-monitor-briefing-de', 'city-monitor-briefing-en']);
    expect(ratingSets.sets[0]!.items.map((i) => i.id)).toEqual([
      'city-monitor-briefing-de-01', 'city-monitor-briefing-de-02', 'city-monitor-briefing-de-03',
    ]);
  });

  it('gives every item 2–4 text options labelled from A', () => {
    for (const item of items) {
      expect(item.options.length).toBeGreaterThanOrEqual(2);
      expect(item.options.length).toBeLessThanOrEqual(4);
      expect(item.options.map((o) => o.label)).toEqual(['A', 'B', 'C'].slice(0, item.options.length));
      expect(item.options.every((o) => o.type === 'text')).toBe(true);
    }
  });

  it('maps each label back to the arm that wrote that option', () => {
    for (const item of items) {
      for (const option of item.options) {
        const arm = ratingKey[item.id]![option.label]!;
        expect(option.content_md).toContain(`from ${ARMS.indexOf(arm)}`);
      }
    }
  });

  it('does not give the baseline the same label on every item', () => {
    const baselineLabels = items.map((item) =>
      Object.entries(ratingKey[item.id]!).find(([, arm]) => arm === ARMS[0])![0]);
    expect(new Set(baselineLabels).size).toBeGreaterThan(1);
  });

  it('puts every arm under every label equally often across the file', () => {
    // 6 items × 3 options: each arm is A, B and C exactly twice. A hash per item
    // alone gave one real file the same order on 5 of 6 items.
    for (const arm of ARMS) {
      const labels = items.map((item) => Object.entries(ratingKey[item.id]!).find(([, a]) => a === arm)![0]).sort();
      expect(labels).toEqual(['A', 'A', 'B', 'B', 'C', 'C']);
    }
  });

  it('gives the same orders when built again from the same picks', () => {
    expect(build(picksFor(['in1', 'in2', 'in3'])).ratingKey).toEqual(ratingKey);
  });

  it('shows the headlines the writer received as context', () => {
    expect(items[0]!.context_md).toContain('1. Senat beschließt Haushalt');
  });

  it('refuses to write when an option names a model', () => {
    expect(() => build(picksFor(['in1']), { text: () => 'Written by GPT-6-Luna.' })).toThrow(/gpt-6-luna/i);
  });

  it('allows "OpenAI" in a briefing when the same name is in that item\'s headlines', () => {
    const run = () => build(picksFor(['in1']), {
      text: () => 'OpenAI eröffnet ein Büro in Mitte.',
      headlines: '1. OpenAI eröffnet Büro in Berlin-Mitte',
    });
    expect(run).not.toThrow();
  });

  it('refuses "OpenAI" in a briefing when the headlines do not mention it', () => {
    expect(() => build(picksFor(['in1']), { text: () => 'OpenAI eröffnet ein Büro.' })).toThrow(/openai/i);
  });
});
