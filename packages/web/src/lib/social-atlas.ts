import type { SocialLayer } from '../hooks/useCommandCenter.js';
import { SOCIAL_ATLAS_COLOR_RAMPS, type SocialAtlasMetric } from '../components/map/constants.js';

/**
 * What each city's social atlas shows. The four indicator slots
 * (SocialAtlasFeatureProps) mean roughly the same everywhere but each city's
 * source defines them its own way, so every city names its indicators with
 * its own label: Köln's unemployment is a rate of the labour force, Berlin's
 * and Hamburg's a share of residents aged 15–64; Köln counts single-parent
 * households, Berlin and Hamburg children of single parents. A slot the
 * city's source lacks is left out, and its sub-layer with it.
 *
 * Keyed by city ID. Each city with the `socialAtlas` feature needs an entry;
 * its `provider`, `edition` and indicators must match the server config and
 * parser (packages/web/src/config/index.test.ts checks).
 */
export interface SocialIndicator {
  metric: SocialAtlasMetric;
  /** Label key under `socialAtlas.indicator` in the locale files. */
  label: string;
  /** Colour stops, where the default ramp for the metric does not fit the city's range. */
  stops?: [number, string][];
}

export interface CitySocialAtlas {
  /** The server's `dataSources.socialAtlas.provider`. */
  provider: string;
  /** Shown next to each indicator in the sidebar: the report or data year. */
  edition: string;
  /** Label key under `socialAtlas.status` for the source's status index, where it has one. */
  status?: string;
  indicators: SocialIndicator[];
}

export const SOCIAL_ATLAS: Readonly<Record<string, CitySocialAtlas>> = {
  // Monitoring Soziale Stadtentwicklung: s1–s4
  berlin: {
    provider: 'mss-wfs',
    edition: '2025',
    status: 'mss',
    indicators: [
      { metric: 'unemployment', label: 'unemployment' },
      { metric: 'singleParent', label: 'singleParentChildren' },
      { metric: 'welfare', label: 'welfare' },
      { metric: 'childPoverty', label: 'childPoverty' },
    ],
  },
  // Sozialmonitoring Integrierte Stadtteilentwicklung: S4, S2, S3, S5
  hamburg: {
    provider: 'hh-sozialmonitoring',
    edition: '2025',
    status: 'hhSozialmonitoring',
    indicators: [
      { metric: 'unemployment', label: 'unemployment' },
      { metric: 'singleParent', label: 'singleParentChildren' },
      { metric: 'welfare', label: 'sgb2Asylblg' },
      { metric: 'childPoverty', label: 'childrenMinimumIncome' },
    ],
  },
  // Statistischer Datenkatalog: D0001P, A0269P, C0007P; no child poverty, no status index
  koeln: {
    provider: 'koeln-datenkatalog',
    edition: '2025',
    indicators: [
      { metric: 'unemployment', label: 'unemploymentRate' },
      // A share of all households, about 4 % city-wide: the children's ramp up to 80 % would colour it all pale
      { metric: 'singleParent', label: 'singleParentHouseholds', stops: [[0, '#fef9c3'], [2, '#fde047'], [4, '#eab308'], [6, '#a16207'], [10, '#713f12']] },
      { metric: 'welfare', label: 'sgb2' },
    ],
  },
};

/** The sub-layer that draws each indicator. */
export const METRIC_LAYER: Readonly<Record<SocialAtlasMetric, SocialLayer>> = {
  unemployment: 'unemployment',
  singleParent: 'single-parent',
  welfare: 'welfare',
  childPoverty: 'child-poverty',
};

export function socialAtlasOf(cityId: string): CitySocialAtlas | undefined {
  return SOCIAL_ATLAS[cityId];
}

/** The city's indicator a sub-layer draws, if it has one. */
export function indicatorOf(atlas: CitySocialAtlas | undefined, layer: SocialLayer | undefined): SocialIndicator | undefined {
  return atlas?.indicators.find((i) => METRIC_LAYER[i.metric] === layer);
}

/** The colour stops of an indicator. */
export function indicatorStops(indicator: SocialIndicator): [number, string][] {
  return indicator.stops ?? SOCIAL_ATLAS_COLOR_RAMPS[indicator.metric].stops;
}
