/**
 * Copyright (C) 2026 Odin Mühlenbein
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

export type CityCategory =
  | 'local'
  | 'politics'
  | 'transit'
  | 'culture'
  | 'crime'
  | 'weather'
  | 'economy'
  | 'sports';

export interface ClassificationResult {
  category: CityCategory;
  confidence: number;
}

interface Rule {
  pattern: RegExp;
  category: CityCategory;
  confidence: number;
}

/**
 * Flat rule list ordered by priority (first match wins).
 * High-confidence rules come first, then medium-confidence.
 * Short/ambiguous terms use word-boundary anchors (\b).
 */
const RULES: Rule[] = [
  // -- High confidence (0.85) --
  // Transit
  { pattern: /Sperrung/i, category: 'transit', confidence: 0.85 },
  { pattern: /Störung/i, category: 'transit', confidence: 0.85 },
  { pattern: /Ausfall/i, category: 'transit', confidence: 0.85 },
  { pattern: /\bBVG\b/i, category: 'transit', confidence: 0.85 },
  { pattern: /S-Bahn/i, category: 'transit', confidence: 0.85 },
  { pattern: /U-Bahn/i, category: 'transit', confidence: 0.85 },
  { pattern: /Verspätung/i, category: 'transit', confidence: 0.85 },
  { pattern: /gesperrt/i, category: 'transit', confidence: 0.85 },
  // Crime
  { pattern: /\bMord\b/i, category: 'crime', confidence: 0.85 },
  { pattern: /Überfall/i, category: 'crime', confidence: 0.85 },
  { pattern: /Festnahme/i, category: 'crime', confidence: 0.85 },
  { pattern: /Messerangriff/i, category: 'crime', confidence: 0.85 },
  { pattern: /Schießerei/i, category: 'crime', confidence: 0.85 },
  // Politics
  { pattern: /Senat/i, category: 'politics', confidence: 0.85 },
  { pattern: /Abgeordnetenhaus/i, category: 'politics', confidence: 0.85 },
  { pattern: /Bezirksbürgermeister/i, category: 'politics', confidence: 0.85 },
  // Culture
  { pattern: /Berlinale/i, category: 'culture', confidence: 0.85 },
  { pattern: /Museumsinsel/i, category: 'culture', confidence: 0.85 },
  { pattern: /Philharmonie/i, category: 'culture', confidence: 0.85 },
  // Weather
  { pattern: /Unwetter/i, category: 'weather', confidence: 0.85 },
  { pattern: /Hitzewelle/i, category: 'weather', confidence: 0.85 },
  { pattern: /Sturm/i, category: 'weather', confidence: 0.85 },
  { pattern: /Hochwasser/i, category: 'weather', confidence: 0.85 },
  // Economy
  { pattern: /Insolvenz/i, category: 'economy', confidence: 0.85 },
  { pattern: /Startup/i, category: 'economy', confidence: 0.85 },
  { pattern: /Ansiedlung/i, category: 'economy', confidence: 0.85 },
  // Sports
  { pattern: /Hertha/i, category: 'sports', confidence: 0.85 },
  { pattern: /Union Berlin/i, category: 'sports', confidence: 0.85 },
  { pattern: /Alba Berlin/i, category: 'sports', confidence: 0.85 },
  { pattern: /Eisbären/i, category: 'sports', confidence: 0.85 },

  // -- Medium confidence (0.6) --
  // Transit
  { pattern: /Baustelle/i, category: 'transit', confidence: 0.6 },
  { pattern: /Umleitung/i, category: 'transit', confidence: 0.6 },
  { pattern: /\bTram\b/i, category: 'transit', confidence: 0.6 },
  { pattern: /Ringbahn/i, category: 'transit', confidence: 0.6 },
  // Crime
  { pattern: /Diebstahl/i, category: 'crime', confidence: 0.6 },
  { pattern: /Einbruch/i, category: 'crime', confidence: 0.6 },
  { pattern: /Polizei/i, category: 'crime', confidence: 0.6 },
  { pattern: /Razzia/i, category: 'crime', confidence: 0.6 },
  { pattern: /Verdächtig/i, category: 'crime', confidence: 0.6 },
  // Politics
  { pattern: /\bWahl\b/i, category: 'politics', confidence: 0.6 },
  { pattern: /Koalition/i, category: 'politics', confidence: 0.6 },
  { pattern: /Protest/i, category: 'politics', confidence: 0.6 },
  { pattern: /\bDemo\b/i, category: 'politics', confidence: 0.6 },
  { pattern: /Bezirk/i, category: 'politics', confidence: 0.6 },
  { pattern: /Bürgermeister/i, category: 'politics', confidence: 0.6 },
  // Culture
  { pattern: /Ausstellung/i, category: 'culture', confidence: 0.6 },
  { pattern: /Konzert/i, category: 'culture', confidence: 0.6 },
  { pattern: /Festival/i, category: 'culture', confidence: 0.6 },
  { pattern: /Theater/i, category: 'culture', confidence: 0.6 },
  { pattern: /Galerie/i, category: 'culture', confidence: 0.6 },
  { pattern: /\bKino\b/i, category: 'culture', confidence: 0.6 },
  // Weather
  { pattern: /Regen/i, category: 'weather', confidence: 0.6 },
  { pattern: /Schnee/i, category: 'weather', confidence: 0.6 },
  { pattern: /Gewitter/i, category: 'weather', confidence: 0.6 },
  { pattern: /Temperatur/i, category: 'weather', confidence: 0.6 },
  // Economy
  { pattern: /Arbeitsmarkt/i, category: 'economy', confidence: 0.6 },
  { pattern: /Miete/i, category: 'economy', confidence: 0.6 },
  { pattern: /Immobilien/i, category: 'economy', confidence: 0.6 },
  { pattern: /Wirtschaft/i, category: 'economy', confidence: 0.6 },
  // Sports
  { pattern: /Bundesliga/i, category: 'sports', confidence: 0.6 },
  { pattern: /Olympiastadion/i, category: 'sports', confidence: 0.6 },
  { pattern: /Marathon/i, category: 'sports', confidence: 0.6 },
];

/** Classify a news headline into a city category. First matching rule wins. */
export function classifyHeadline(
  title: string,
  _cityId: string,
): ClassificationResult {
  for (const rule of RULES) {
    if (rule.pattern.test(title)) {
      return { category: rule.category, confidence: rule.confidence };
    }
  }
  return { category: 'local', confidence: 0.3 };
}
