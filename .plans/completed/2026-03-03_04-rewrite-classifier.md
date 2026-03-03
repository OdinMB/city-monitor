# Plan 04: Rewrite classifier.ts (Remove worldmonitor derivation)

## Goal

Rewrite the keyword-based news classifier with an independent structure, removing the adapted architecture from worldmonitor's threat classifier.

## Context

`packages/server/src/lib/classifier.ts` was adapted from worldmonitor's `server/worldmonitor/news/v1/_classifier.ts`. The keywords are 100% different (German city categories vs English geopolitical threats), but the structural pattern was taken: tiered keyword maps → regex matching with word-boundary handling for short terms → confidence-based result.

## Callers

- `ingest-feeds.ts` — classifies each headline: `classifyHeadline(title, cityId)`
- `classifier.test.ts` — 7 test cases

Public API: `classifyHeadline(title: string, cityId: string): ClassificationResult`

## Approach

Rewrite using a flat rule array instead of nested `Record<CityCategory, KeywordTier>` maps. This is a natural, simpler design that doesn't mirror the original's tiered structure.

```ts
interface Rule {
  pattern: RegExp;
  category: CityCategory;
  confidence: number;
}

const RULES: Rule[] = [
  { pattern: /\bBVG\b/i, category: 'transit', confidence: 0.85 },
  { pattern: /S-Bahn/i, category: 'transit', confidence: 0.85 },
  // ...
];
```

First match wins (rules ordered by priority). This is structurally distinct from the original's nested-map-with-separate-high/medium-pass approach.

## Steps

1. Rewrite `packages/server/src/lib/classifier.ts`:
   - Use a flat `Rule[]` array with pre-compiled `RegExp` patterns
   - First-match-wins instead of two separate passes (high then medium)
   - Same exported types: `CityCategory`, `ClassificationResult`
   - Same function signature: `classifyHeadline(title, cityId)`
   - Keep all the same German keywords — those are original content
2. Replace the attribution header with the standard new-code header
3. Run `classifier.test.ts` — all 7 tests should pass
4. Run `ingest-feeds.test.ts` as integration check
