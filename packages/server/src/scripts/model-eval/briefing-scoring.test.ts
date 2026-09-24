import { describe, it, expect } from 'vitest';
import { checkBriefing, lengthBounds, scoreBriefingArms, selectRatingArms, type BriefingOutcome } from './briefing-scoring.js';

const TEXT = {
  de: 'Der Senat hat am Montag beschlossen, dass die Mieten in der Stadt nicht weiter steigen sollen. Die Opposition kritisiert den Plan und sagt, er komme zu spät.',
  en: 'The Senate decided on Monday that rents in the city should not rise any further. The opposition criticised the plan and said it was not enough.',
  tr: 'Senato pazartesi günü şehirdeki kiraların daha fazla artmaması için bir karar aldı. Muhalefet bu planı eleştirdi ve yeterli olmadığını söyledi.',
  ar: 'قرر مجلس الشيوخ يوم الاثنين أن الإيجارات في المدينة يجب ألا ترتفع أكثر. وانتقدت المعارضة الخطة.',
};

describe('checkBriefing — language', () => {
  it('passes each language in its own slot', () => {
    for (const lang of ['de', 'en', 'tr', 'ar'] as const) {
      expect(checkBriefing(lang, TEXT[lang], '').rightLanguage).toBe(true);
    }
  });

  it('fails English or German text in the Turkish slot', () => {
    expect(checkBriefing('tr', TEXT.en, '').rightLanguage).toBe(false);
    expect(checkBriefing('tr', TEXT.de, '').rightLanguage).toBe(false);
  });

  it('fails Latin-script text in the Arabic slot', () => {
    expect(checkBriefing('ar', TEXT.en, '').rightLanguage).toBe(false);
  });

  it('fails German text in the English slot and vice versa', () => {
    expect(checkBriefing('en', TEXT.de, '').rightLanguage).toBe(false);
    expect(checkBriefing('de', TEXT.en, '').rightLanguage).toBe(false);
  });

  it('treats an empty text or a dash as absent', () => {
    expect(checkBriefing('de', '-', '').present).toBe(false);
    expect(checkBriefing('de', undefined, '').present).toBe(false);
    expect(checkBriefing('de', '-', '').hardPass).toBe(false);
  });
});

describe('checkBriefing — markdown', () => {
  const md = (text: string) => !checkBriefing('de', text, '').noMarkdown;

  it('flags bullets, numbered lists, headings and bold', () => {
    expect(md('- Punkt eins\n- Punkt zwei')).toBe(true);
    expect(md('• Punkt eins')).toBe(true);
    expect(md('## Überschrift\nText')).toBe(true);
    expect(md('Das ist **wichtig**.')).toBe(true);
    expect(md('1. Erstens\n2. Zweitens')).toBe(true);
  });

  it('does not flag hyphenated words, an en dash mid-sentence or a single numbered club name', () => {
    expect(md('Die Karl-Marx-Allee wird gesperrt – ab Montag gilt eine Umleitung.')).toBe(false);
    expect(md('1. FC Union gewinnt das Derby.\n\nDer Senat berät am Dienstag.')).toBe(false);
  });
});

describe('checkBriefing — length', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'wort').join(' ');

  it('passes lengths inside each language\'s bounds, both ends included, and fails outside them', () => {
    for (const lang of ['de', 'en', 'tr', 'ar']) {
      const { min, max } = lengthBounds(lang);
      expect(checkBriefing(lang, words(min - 1), '').lengthOk).toBe(false);
      expect(checkBriefing(lang, words(min), '').lengthOk).toBe(true);
      expect(checkBriefing(lang, words(max), '').lengthOk).toBe(true);
      expect(checkBriefing(lang, words(max + 1), '').lengthOk).toBe(false);
    }
  });
});

describe('checkBriefing — soft signals', () => {
  it('lists numbers that do not occur in the headlines', () => {
    const check = checkBriefing('de', 'Am Montag wurden 12 Menschen verletzt, 2026 soll es besser werden.', '1. Unfall: 12 Verletzte');
    expect(check.unknownNumbers).toEqual(['2026']);
  });

  it('counts paragraphs the way the dashboard splits them: on blank lines only', () => {
    expect(checkBriefing('de', 'Absatz eins.\n\nAbsatz zwei.', '').paragraphs).toBe(2);
    expect(checkBriefing('de', 'Absatz eins.\n \nAbsatz zwei.', '').paragraphs).toBe(2);
    expect(checkBriefing('de', 'Absatz eins.\nAbsatz zwei.', '').paragraphs).toBe(1);
  });
});

describe('scoreBriefingArms', () => {
  // The fixture texts are short, so length is waived; language decides pass/fail.
  function checksIgnoringLength(texts: Record<string, string>) {
    return Object.fromEntries(Object.entries(texts).map(([lang, text]) => {
      const check = checkBriefing(lang, text, '');
      return [lang, { ...check, lengthOk: true, hardPass: check.present && check.rightLanguage && check.noMarkdown }];
    }));
  }

  function outcomeWith(arm: string, inputId: string, texts: Record<string, string>, costUsd = 0.001): BriefingOutcome {
    return {
      arm,
      inputId,
      record: {
        site: 'briefing', arm, requestId: inputId, inputIds: [inputId], ms: 100, inTok: 100, outTok: 100,
        reasoningTok: 0, costUsd, finishReason: 'stop', parsed: { briefings: texts },
      },
      checks: checksIgnoringLength(texts),
    };
  }

  function outcome(arm: string, inputId: string, pass: boolean, costUsd: number): BriefingOutcome {
    return outcomeWith(arm, inputId, pass ? TEXT : { ...TEXT, tr: TEXT.en }, costUsd);
  }

  it('reports each language\'s shortest and longest briefing, skipping absent ones', () => {
    const outcomes = [
      outcomeWith('a', 'in1', TEXT),
      outcomeWith('a', 'in2', { ...TEXT, de: `${TEXT.de} ${TEXT.de}` }),
      outcomeWith('a', 'in3', { ...TEXT, en: '-' }),
    ];
    const [score] = scoreBriefingArms([{ id: 'a', model: 'm' }], outcomes, ['in1', 'in2', 'in3'], ['de', 'en'], 120);
    const deWords = checkBriefing('de', TEXT.de, '').words;
    const enWords = checkBriefing('en', TEXT.en, '').words;
    expect(score!.wordRange.de).toEqual({ min: deWords, max: 2 * deWords });
    expect(score!.wordRange.en).toEqual({ min: enWords, max: enWords });
  });

  it('ranks by all-language pass share, then cost', () => {
    const arms = [
      { id: 'cheap-fail', model: 'm1' },
      { id: 'pricey-pass', model: 'm2' },
      { id: 'cheap-pass', model: 'm3' },
    ];
    const outcomes = [
      outcome('cheap-fail', 'in1', false, 0.001),
      outcome('pricey-pass', 'in1', true, 0.05),
      outcome('cheap-pass', 'in1', true, 0.002),
    ];
    const ranked = scoreBriefingArms(arms, outcomes, ['in1'], ['de', 'en', 'tr', 'ar'], 120);
    expect(ranked.map((s) => s.arm)).toEqual(['cheap-pass', 'pricey-pass', 'cheap-fail']);
    expect(ranked[2]!.allPassShare).toBe(0);
    expect(ranked[2]!.passRates.tr!.rightLanguage).toBe(0);
  });
});

describe('selectRatingArms', () => {
  const ranked = [
    { arm: 'gpt-6-sol@low', model: 'gpt-6-sol' },
    { arm: 'gpt-6-luna@medium', model: 'gpt-6-luna' },
    { arm: 'gpt-6-luna@high', model: 'gpt-6-luna' },
    { arm: 'gpt-6-sol@medium', model: 'gpt-6-sol' },
    { arm: 'gpt-5-mini@default', model: 'gpt-5-mini' },
  ];
  const base = { ranked, baselineArm: 'gpt-5-mini@default' };

  it('picks the baseline, the best Luna and the best Sol arm', () => {
    const picks = selectRatingArms({ ...base, inputIds: ['in1'], eligible: () => true });
    expect(picks).toEqual([
      { inputId: 'in1', lang: 'de', armIds: ['gpt-5-mini@default', 'gpt-6-luna@medium', 'gpt-6-sol@low'] },
      { inputId: 'in1', lang: 'en', armIds: ['gpt-5-mini@default', 'gpt-6-luna@medium', 'gpt-6-sol@low'] },
    ]);
  });

  it('replaces an ineligible pick with the next arm of the same model first', () => {
    const picks = selectRatingArms({
      ...base,
      inputIds: ['in1'],
      eligible: (_input, _lang, arm) => arm !== 'gpt-6-luna@medium',
    });
    expect(picks[0]!.armIds).toEqual(['gpt-5-mini@default', 'gpt-6-luna@high', 'gpt-6-sol@low']);
  });

  it('drops to two options when only two arms are eligible', () => {
    const picks = selectRatingArms({
      ...base,
      inputIds: ['in1'],
      eligible: (_input, _lang, arm) => arm === 'gpt-5-mini@default' || arm === 'gpt-6-sol@medium',
    });
    expect(picks[0]!.armIds).toEqual(['gpt-5-mini@default', 'gpt-6-sol@medium']);
  });

  it('skips an input with fewer than two eligible arms in German or English, and stops at three inputs', () => {
    const picks = selectRatingArms({
      ...base,
      inputIds: ['in1', 'in2', 'in3', 'in4', 'in5'],
      eligible: (input, lang, arm) => !(input === 'in2' && lang === 'en' && arm !== 'gpt-6-sol@low'),
    });
    expect([...new Set(picks.map((p) => p.inputId))]).toEqual(['in1', 'in3', 'in4']);
    expect(picks).toHaveLength(6);
  });
});
