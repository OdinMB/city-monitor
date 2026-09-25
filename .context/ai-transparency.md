# AI transparency record (EU AI Act, Art. 50)

_Last assessed: 2026-09-25 · by: agent run (ai-act-disclosure skill, improvement mode) · labels implemented 2026-09-25 from the owner-approved copy, pending deploy · skill facts verified: 2026-09-25 · next re-test: 2026-11-15_

<!-- Next re-test 2026-11-15: the briefing's text-marking gap waits on OpenAI, and the latest deadline under any reading is 2026-12-02.
     Also re-test whenever a feature, model or label changes. -->

> Not legal advice. This is an engineering record of how this project meets the AI Act's transparency duties. The latest full assessment is `DOCS/2026-09-25_ai-act-disclosure-assessment.md`, which is local and not versioned. There is no `.context/system-overview.md`; processors and data flows are not recorded elsewhere yet.

## 1. Roles

| Item | Value | Evidence |
|---|---|---|
| Name on the system (F1) | "City Monitor" (citymonitor.app), run by the operator named in the imprint as a private individual | `packages/web/src/pages/ImprintPage.tsx`; `LICENSE`; `NOTICE` |
| Our role | Provider of all four AI features, and deployer of the briefing, which the site publishes | [G ¶¶10–11, 15] |
| Partner and written role split (F6) | No partner | — |
| Audience; minors or vulnerable users (F2) | Public, no login, de/en/tr/ar. No age gate; minors not ruled out | `packages/web/src/i18n/index.ts`; `render.yaml` (`ACTIVE_CITIES=berlin`) |
| Professional or personal (F3) | Free and donation-funded (Ko-fi), no ads. Treated as **professional** (conservative) until the owner answers §11 Q3 | `packages/web/src/lib/constants.ts`; `.github/FUNDING.yml` |
| Open source; hosted instance (F5) | AGPL-3.0-or-later; hosted on Render (Frankfurt), assumed live. Open source gives no Art. 50 exemption [G ¶23] | `LICENSE`; `render.yaml` |
| Code of Practice signatory | No | — |

## 2. AI features

All four run server-side on cron, through OpenAI via LangChain. Model defaults live in `packages/server/src/lib/llm-client.ts` (`SITES`); env vars can override them (§11 Q1).

| # | Feature | Call site | Vendor · model id | Modality | Length | Mode | Destination | Human review | First public (F4) |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Daily briefing, two paragraphs per language (de/en/tr/ar in one call) | `cron/summarize.ts` → `lib/openai.ts` `summarizeHeadlines`; prompt `lib/llm-prompts.ts` | OpenAI · `gpt-6-luna` @ `high` (`OPENAI_MODEL`, `OPENAI_SUMMARY_EFFORT`) | text | **≥200 tokens** in every language (~140–194 words, `.context/news.md`) | cron, every 6 h | dashboard hero tile (`strips/BriefingStrip.tsx`); public JSON `GET /api/:city/news/summary`; DB `ai_summaries` ≤7 days | none | ~Mar 2026 (§11 Q2); model switched 2026-09-24 |
| 2 | News relevance filter, category, importance score | `lib/openai.ts` filter pipeline; drop logic `cron/ingest-feeds.ts` | OpenAI · `gpt-6-luna` @ `medium` (`OPENAI_FILTER_MODEL`) | classification / score | single words, a number | cron, every 10 min | News tile, ticker, map popups, digest API | none | ~Mar 2026 |
| 3 | Place labels and map pins for news (the prompt lets the model infer places) | same call as #2 (`locationLabel`) | OpenAI · `gpt-6-luna` @ `medium` | short text | 1–5 words | cron | map popup `📍 label`, News tile pin | none | ~Mar 2026 |
| 4 | Place extraction for police reports | `lib/openai.ts` geo pipeline | OpenAI · `gpt-6-luna` @ `none` (`OPENAI_GEO_MODEL`, then `OPENAI_FILTER_MODEL`) | short text (extracted) | 1–5 words | cron, every 10 min | map popup, police sub-layer (off by default) | none | ~Mar 2026 |

Not AI: OG images, favicons, Firecrawl (scrape only), transit/event/police-district tags (keyword rules). No chatbot, no image/audio/video generation, no outbound feeds, newsletters, social posts or exports. The model-eval harness (`npm run eval:models`) is developer-only and not a feature.

## 3. Duties and measures

| Feature | Duty | Measure | Implemented at | Verdict | Deadline | Last verified |
|---|---|---|---|---|---|---|
| 1 Briefing | Art. 50(1) interaction | Not interactive: no user prompt reaches the model | — | N/A [G ¶30] | — | 2026-09-25 (code) |
| 1 Briefing | Art. 50(2) marking | **No watermark: OpenAI text carries none (V1).** Interim, *not equivalent to the Code's watermark layer*: the summary JSON carries `aiGenerated: true` and `generator: "<model id>"` (the id is stored per row at generation), and the briefing's DOM container carries `data-ai-generated="true"`. Both are plain metadata: they do not travel with copied text and nothing verifies them | `packages/server/src/routes/news.ts:104-105`; `shared/types.ts` `NewsSummaryData`; `packages/web/src/components/strips/BriefingStrip.tsx:16` | **UPSTREAM-GAP** (owner: wait for OpenAI, §5) | now (conservative: §10 q2, q7); 2026-12-02 at the latest | 2026-09-25 (`routes/summary.test.ts`, `BriefingStrip.test.tsx`) |
| 1 Briefing | Art. 50(2) detection | None exists for OpenAI text | — | **UPSTREAM-GAP** [G ¶¶70, 75–78] | as above | 2026-09-25 |
| 1 Briefing | Art. 50(4) label | **Implemented, pending deploy.** Badge **AI** plus "AI-generated" / "KI-generiert" / "Yapay zekâ ile oluşturuldu" / "مُنشأ بالذكاء الاصطناعي" next to the Briefing tile's heading, and a first line inside the tile: "Written automatically by AI from current local headlines. Not reviewed by an editor; may contain errors." (DE/TR/AR equivalents). Owner-approved copy, CM-1 option (a) with CM-2. TR and AR shipped without a native-speaker check (§11) | `packages/web/src/components/AiLabel.tsx`, mounted as `titleBadge` in `components/layout/CommandLayout.tsx`; notice in `components/strips/BriefingStrip.tsx`; copy in `i18n/*.json` (`aiLabel.*`, `aiNotice.briefing`) | **PASS in code, FAIL live until deployed** [G ¶¶131, 134–138]. Whether the wording suffices is UNCONFIRMED: the law sets no words | now (since 2026-08-02) | 2026-09-25 (rendering tests, 4 languages; D3 not run) |
| 1 Briefing | Art. 50(5) visible, timely, accessible | The badge sits in the tile heading, so it is on screen whenever the briefing is; the notice is the first line above the text. Both are real text in the UI language, with `lang`, `dir="rtl"` in Arabic and the Latin "AI" in a `<bdi>`. The badge has one accessible name ("AI-generated"), the notice is a `role="note"`, and text contrast is at least 4.5:1 (gray-500 on white, gray-400 on the dark card) | as above; `AiLabel.test.tsx`, `BriefingStrip.test.tsx`, `App.test.tsx` | **PASS in code, pending deploy** | now | 2026-09-25 (rendering tests; D3 not run) |
| 2 Classification | Art. 50(1), (2), (4) | Ranking, single-word categories and a score; no generated text is published. Voluntary (CM-4, pending deploy): News-tile legend "Selected, rated and tagged by AI.", and the "NN%" score carries the tooltip and accessible name "Importance score from AI" | `components/strips/NewsStrip.tsx` (`aiNotice.newsLegend`, `aiNotice.importanceScore`) | N/A [G ¶¶30, 65, 68, 131(ii)] | — | 2026-09-25 (`NewsStrip.test.tsx`) |
| 3, 4 Places | Art. 50(2), (4) | Short sequences (place names), extracted or inferred. Voluntary (CM-5, pending deploy): "Location estimated by AI" next to `📍 label` in the news and police map popups, and as the tooltip and accessible name of the News-tile pin | `components/map/layers/news-safety.ts` (`placeLine`); `components/strips/NewsStrip.tsx` (`aiNotice.locationEstimated`) | N/A [G ¶¶65, 68, 131(ii)] | — | 2026-09-25 (`news-safety.test.ts`, `NewsStrip.test.tsx`) |

The Sources page's AI section (`packages/web/src/pages/SourcesPage.tsx`, `aiProcessingGroup`; keys `sources.aiProcessing.*`) is in all four UI languages and names the vendor, not the model ("An OpenAI language model selects, rates and tags news headlines, places news and police reports on the map, and writes the daily briefing."), so it cannot drift from `lib/llm-client.ts` (owner's edit to CM-3; pending deploy). The rest of that page is still English. It supports the label but never replaces one [G ¶38].

## 4. Upstream reliance and test results

| Output | Vendor · model | Marking relied on | Detection available | Tested on | Method | Result |
|---|---|---|---|---|---|---|
| Briefing text | OpenAI · `gpt-6-luna` | None available: OpenAI states the goal for text, with no date (V1, SECONDARY vendor) | None | 2026-09-25 | Vendor docs per the skill's same-day fact-check | No mark to rely on |
| Briefing JSON marker | — (ours) | `aiGenerated`, `generator` | Read the field | 2026-09-25 | `routes/summary.test.ts` boots the Express app and fetches `/api/berlin/news/summary` | Present with a briefing; `false`/`null` without one |
| Briefing DOM marker | — (ours) | `data-ai-generated="true"` | Read the attribute | 2026-09-25 | `BriefingStrip.test.tsx` (jsdom); no browser check (D3 not run) | On the element holding the text; absent in the empty state |
| Visible labels and notes (§3) | — (ours) | — | — | 2026-09-25 | Rendering tests (jsdom) in all four languages against the approved text in `src/test-fixtures/approved-ai-copy.ts`: exact text, accessible name, `lang`/`dir`. Written first and seen red before the labels were mounted | Present at first render; not yet seen in a browser (D3) |

## 5. Text-marking feasibility assessment

- **What reaches people:** the briefing, ≥200 tokens per language in de/en/tr/ar, from `gpt-6-luna`, up to four times a day, on the public dashboard and the public JSON API. Features 2–4 produce ranking output or short sequences and are out of scope for marking.
- **Why it is not marked:** OpenAI's text output carries no watermark or other provenance signal as of 2026-09-25 (V1). No official source addresses a downstream provider whose upstream model does not watermark text (brief §10 q1).
- **Options considered** (fix-patterns §8, costed in the assessment §5 D-2):
  1. Move the briefing alone to a Claude model with an active text watermark (Opus 5.5, Opus 5 or Fable 5.1, SECONDARY vendor [ANT]). Estimated $7–17 a month against ~$0.17 today; a new processor; an eval re-run in four languages; detection only as a private preview (§10 q17).
  2. A third-party or post-hoc text watermark: legally envisaged [G ¶74], but no production-grade service was verified (UNCONFIRMED).
  3. This assessment and the gap analysis in §6: documentation, not compliance.
  4. **Wait for OpenAI.**
  5. Pause the briefing.
- **Chosen (owner decision, relayed to the 2026-09-25 run): wait for OpenAI (option 4)**, with option 3 documented here. Interim measures meanwhile:
  - the visible label and notice (§3), implemented 2026-09-25 and pending deploy;
  - the machine-readable markers in §3. **They are not equivalent to the Code's watermark layer** [CoP Sub-measure 1.1.2]: free-form text "cannot transport metadata", and a JSON field or HTML attribute is lost the moment the text is copied.
- **Feasibility is judged objectively**, "not dependent on the specific resources and capabilities of individual providers" [G ¶81]. Text watermarking is on the market from another vendor today (option 1), which weakens any infeasibility argument; implementation cost may be taken into account [G ¶85]. **Residual risk:** under the conservative reading the marking duty is due now (§10 q2, q7), so waiting leaves B6/B8 open until OpenAI ships text provenance or the owner switches the briefing's model.
- **Monitoring and re-test:** on **2026-11-15**, re-check OpenAI's text provenance (the skill's V1 sources: OpenAI's content-provenance guide, the provenance help article, and the "advancing content provenance" post). If OpenAI text still carries no mark, bring option 1 back to the owner with current prices before **2026-12-02**, the latest deadline under any reading.

## 6. Gap analysis against the Code of Practice

| Code measure | What it expects | What we do | Gap | Plan |
|---|---|---|---|---|
| S1 M1.1 multi-layer marking | A watermark on free-form text of ≥200 tokens | No watermark (upstream). Unsigned JSON and DOM metadata only (§3) | **Yes**: the watermark layer is missing; the metadata is not a substitute | Wait for OpenAI; re-test 2026-11-15; re-decide before 2026-12-02 (§5) |
| S1 M1.2 non-removal | Preserve marks; a ToS prohibition on removing them; no circumvention tools | Nothing strips marks (there are none to strip). No prohibition published | Yes (minor) | FOSS docs note once a mark exists (fix-patterns §9; public copy, owner) |
| S1 M2.1 detection | Free detection; expert-only is allowed for text watermarks | None exists for OpenAI text | **Yes** (upstream) | As M1.1 |
| S1 Commitment 3 robustness | Robust to copy, paraphrase and format change | Not applicable until a watermark exists. The metadata markers are not robust by design | Yes (follows M1.1) | As M1.1 |
| S1 Commitment 4 compliance process | A documented, proportionate process with testing | This record; unit and route tests for the markers; rendering tests for the labels; a fixed re-test date | Partial: no runtime (D3) check yet | D3 check after deploy |
| S2 M1.1–1.2 labels | An "AI" main element, placed at first exposure, accessible | `AiLabel` (badge + second layer, accessible name, `lang`/`dir`) in the Briefing tile heading, and the notice line above the text (§3). Pending deploy | None in code once deployed; TR/AR not native-checked | Deploy; D3 check; native-speaker check (§11) |
| S2 Commitment 2 labelling process | Internal documentation, label verification, correction of mislabelling | §7 below. No correction channel published | Yes | Owner approves a correction line (fix-patterns §9) |
| S2 Commitment 3 creative works | Non-hampering disclosure | Not applicable: the briefing is news, not an evidently creative work | — | — |
| S2 Commitment 4 human review | A policy naming the responsible person | Not applicable: the human-review exception is not relied on | — | — |

## 7. Label policy and correction channel

- **Labels in use** (implemented 2026-09-25, pending deploy; owner-approved copy from `DOCS/2026-09-25_ai-label-copy-review.md`, items CM-1 to CM-5):

  | Where | Keys | Form |
  |---|---|---|
  | Briefing tile heading (CM-1) | `aiLabel.badge`, `aiLabel.generated`, `aiLabel.accessibleName` | `AiLabel`: "AI" badge in a `<bdi>` + "AI-generated", one accessible name |
  | First line of the Briefing tile (CM-2) | `aiNotice.briefing` | `role="note"` paragraph, outside the `data-ai-generated` text |
  | Sources page, AI section (CM-3) | `sources.aiProcessing.title`, `.description` | Section heading and text; vendor named, model not |
  | News tile, under the category tabs (CM-4) | `aiNotice.newsLegend` | `role="note"` line |
  | News tile "NN%" score (CM-4) | `aiNotice.importanceScore` | `role="meter"` named by the key, same text as tooltip |
  | Map popups for news and police, after `📍 label` (CM-5) | `aiNotice.locationEstimated` | Inline text after " · ", escaped; looked up when the popup opens |
  | News-tile 📍 pin (CM-5) | `aiNotice.locationEstimated` | Tooltip and accessible name of the pin (no visible text: the pin shows no place) |

  **TR and AR shipped without a native-speaker check.** They are the review document's drafts; the CM-3 TR/AR lines were adapted by the agent to the owner's generic model naming ("Bir OpenAI dil modeli …", "نموذج لغوي من OpenAI …"). CM-6 (privacy page line) was skipped by the owner.
- **Changing the wording:** the copy is approved word for word. A change needs the owner's approval and an update to `packages/web/src/test-fixtures/approved-ai-copy.ts`, which the rendering tests compare against, so an unapproved edit to the translation files fails the suite.
- **How labels are checked:** rendering tests in all four languages assert exact text, accessible name, `lang`/`dir` and placement (`AiLabel.test.tsx`, `BriefingStrip.test.tsx`, `NewsStrip.test.tsx`, `news-safety.test.ts`, `SourcesPage.test.tsx`, `App.test.tsx`). After deploy, confirm them in a browser as a first-time visitor in all four languages (D3).
- **Correction channel:** none published. The imprint's contact is the obvious route once the owner approves a line.

## 8. Human-review policy

Not applicable: the briefing is published by cron with no review step, so the Art. 50(4) human-review exception is not relied on.

## 9. AI literacy (Art. 4)

The owner is the only operator: the owner configures the models, runs the model-eval harness (`.context/model-eval.md`) before changing a model, effort or prompt, and keeps this record. No one else operates the AI features.

## 10. Adjacent rules

| Item | Status | Where |
|---|---|---|
| Art. 5 safeguards for images of real people (from 2026-12-02) | N/A: no image generation or editing | — |
| Privacy notice names the AI vendors and the transfers | Not added: owner decision 2026-09-25 (CM-6 skipped, "user data is not processed"). No visitor data goes to OpenAI; publisher and police text does, and whether GDPR Art. 14 applies because those texts can name people was not researched | `packages/web/src/pages/PrivacyPage.tsx` |
| Imprint (§ 5 DDG / § 18 MStV) | Present | `packages/web/src/pages/ImprintPage.tsx` |
| Vendor terms (OpenAI Sharing & Publication Policy) | It asks for a disclosure "no reader could possibly miss": met in code by the badge and the notice line, pending deploy | §3 |
| Consumer law (B2C only) | N/A: free service, no contract | — |

## 11. Open items

| Item | Check | Who | Due |
|---|---|---|---|
| **Deploy** the labels (web static site) and the briefing-retention fix (API): implemented and committed 2026-09-25, not deployed. Until then the live site still has no label (§3 FAIL live) | C4, D1, D2, F-4 | owner | now |
| **Native-speaker check** of the TR and AR strings (`aiLabel.*`, `aiNotice.*`, `sources.aiProcessing.*` in `tr.json`/`ar.json`): they shipped unchecked. Any fix goes into `approved-ai-copy.ts` too | D2 | owner | soon |
| **Visible copy, other:** correction-channel line; no-removal note (B9, once a mark exists) | advisory | owner | — |
| **Vendor or model, D-2:** decided 2026-09-25: wait for OpenAI. Re-check OpenAI text provenance; if still absent, re-present option 1 (Claude for the briefing only) with current prices | B6, B8 | agent re-test, owner decision | 2026-11-15 (re-test); 2026-12-02 (latest deadline) |
| **Roles and legal positions:** confirm in writing that the residual risk of waiting (B6/B8 open now under the conservative reading) is accepted | B6, B8 | owner | now |
| **Spending:** a model-eval run in four languages, only if option 1 is chosen | D-2 | owner | — |
| **Q1 (ASK-OWNER):** is `OPENAI_MODEL`, `OPENAI_FILTER_MODEL` or `OPENAI_GEO_MODEL` set on Render, and to what? The record assumes the code default `gpt-6-luna`; any OpenAI model keeps B6/B8 at UPSTREAM-GAP | inventory | owner | — |
| **Q2 (ASK-OWNER):** when did citymonitor.app first go public with the briefing? Matters only for the favourable G ¶153 reading (grace to 2026-12-02) | B6 deadline | owner | — |
| **Q3 (ASK-OWNER):** do Ko-fi donations arrive regularly, and is City Monitor presented as part of professional AI work? Decides C0; "professional" is assumed | C0 → C4 | owner | — |
| **D3 runtime check:** first-time visitor in a browser, all four languages, after deploy: badge and notice on the Briefing tile, News legend, score tooltip, popup location note, Sources AI section; confirm `data-ai-generated` on the served page | D1, D2 | agent | after deploy |
