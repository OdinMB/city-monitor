# News & AI Summarization

## Feed Ingestion

### Data Flow

1. **Ingestion** (`packages/server/src/cron/ingest-feeds.ts`) — Runs every 10 minutes. Fetches RSS/Atom feeds from city-configured sources (6 feeds for Berlin across 3 tiers). Parses with `fast-xml-parser`, deduplicates by URL+title hash, sorts by tier → importance (desc) → recency. **Before LLM filtering, loads existing assessments from DB** — only genuinely new items (hash not in DB) are sent through the LLM filter. The LLM assigns `category`, `relevant_to_city`, and `importance` (0–1). After filtering, writes to cache keys `{cityId}:news:digest` and `{cityId}:news:{category}` (TTL 900s), then persists all items with their assessments to Postgres via UPSERT (dedup on cityId+hash), without the description of items from a `storeText: false` feed. Uses in-flight coalescing via `cache.fetch()` to avoid re-fetching the same feed within 20 min (TTL 1200s).

2. **API** (`packages/server/src/routes/news.ts`) — `GET /api/:city/news/digest` returns cached digest, falls back to Postgres (with `applyDropLogic`), then empty structure.

3. **Frontend** (`packages/web/src/components/strips/NewsStrip.tsx`) — Uses `useNewsDigest()` hook (refetch 5 min). Category tabs in `ALL_CATEGORIES` order (All, Politics, Economy, Culture, Local, Transit, Crime, Sports); a category's tab appears only when the digest has items in it. "weather" items (`HIDDEN_CATEGORIES`) get no tab and are left out of "All" too. Max 15 items per view (`MAX_ITEMS`).

### Feed Configuration

Feeds are defined in city config files (e.g. `packages/server/src/config/cities/berlin.ts`). Each feed has:
- `name`, `url`, `tier` (1=primary, 2=secondary, 3=tertiary; the type also allows 4), `type` (kind of source: 'wire'|'gov'|'mainstream'|'tech'|'other' — the parser detects RSS vs Atom itself), `lang`, optional `category` (the item's category until the LLM classifier assigns one, which replaces it; default `local`)
- optional `storeText: false` for a feed whose terms forbid archiving its content. Its items are classified with their description and the cached digest keeps it, but `news_items` stores only title and link (with the verdict and location). `ingest-feeds.ts` drops the description just before `saveNewsItems`, matching items to the feed by `sourceUrl`. Set it on any feed with such terms.

Berlin has 6 feeds: rbb24, Tagesspiegel, Berliner Morgenpost, Berliner Zeitung, Polizei Berlin (category=crime), Gründerszene. Hamburg has 3 (NDR Hamburg, MOPO, Feuerwehr Hamburg), Köln 4 (WDR Rheinland, Kölner Stadt-Anzeiger, EXPRESS, Stadt Köln), München 2 (BR24 Oberbayern, Feuerwehr München).

Feed status (checked 2026-09-24):

- **BZ Berlin: removed 2026-09-24 for licensing; do not re-add it.** A working feed exists (`/feed/berlin.xml`), but BZ's RSL licence (`/rsl.xml`, linked from `robots.txt`) prohibits `ai-input`, and every news item here goes through the LLM classifier.
- **Exberliner: removed 2026-09-24.** It rebranded as The Berliner and no longer publishes a feed; every WordPress feed URL 302s to the homepage.
- **taz Berlin: removed 2026-11-01 for licensing; do not re-add without taz's permission** (lizenzen@taz.de). taz.de's `robots.txt` reserves commercial TDM under §44b UrhG and states: "The use of robots or other automated means to access taz.de or collect or mine data without the express permission of taz.de is strictly prohibited." The owner chose to treat that like the notices that ruled out ZEIT, taz Nord and t-online for Hamburg. (The feed was `https://taz.de/Berlin/!p4649;rss/`.)
- **rbb24: `storeText: false` since 2026-10-27.** Its feed says the content is for non-commercial sites only and must not be archived; `robots.txt` reserves AI training but allows retrieval/grounding with attribution. So its items are classified with their description as they arrive and the live digest carries it, but Postgres keeps only title and link. Where the digest comes from Postgres (cache warming after a restart, the route's DB fallback), rbb24 items have no description until the next ingest run; the dashboard shows no news descriptions, so only API readers see the gap. Classification never reads a description from Postgres (stored rows give only their verdict), so it is unaffected. A briefing written on a digest warmed from Postgres (summarize stale at start while news is fresh, so it does not wait for ingestion) sees rbb24 headlines without their teaser. The briefing stores only its own text, never its inputs. Rows stored before the change lose their description the next time the feed lists the item (the upsert refreshes `description`); the rest go with the 3-day retention, so no migration or deletion was needed. The model-eval harness still writes the live feed text, rbb24's included, into `inputs.json` under the gitignored `DOCS/` it is pointed at.

Hamburg feed status (checked 2026-11-01). The standard: an explicit ban on AI input (an RSL `ai-input` prohibition, or terms forbidding passing the text on) is out; a generic §44b UrhG TDM reservation or a robots.txt block of AI crawlers is noted but not disqualifying, since City Monitor polls with a plain feed reader and trains nothing.

- **NDR Hamburg: kept.** `robots.txt` blocks AI training crawlers and carries a legal notice reserving TDM under §44b(3) UrhG and forbidding use "for the purpose of training, fine-tuning, or otherwise developing artificial intelligence models", but states the restriction "does not apply to automated access for the sole purpose of retrieval-augmented generation (RAG) or grounding, provided … the content is attributed to its original source". No RSL file (`/rsl.xml` 404), no `tdm-reservation` meta. The old URL `index-rss.xml` now 308-redirects to an RSS 1.0 (RDF) feed the parser can't read, so NDR delivered nothing from the multi-city launch until the switch to `index~rss2.xml` (RSS 2.0, ~60 items with descriptions).
- **Hamburger Abendblatt: removed 2026-11-01 for licensing; do not re-add without a licence.** The feed's `<copyright>` says: "RSS Meldungen dürfen nur unverändert wiedergegeben und ausschließlich online verwendet werden. Die eingeräumten Nutzungsrechte beinhalten ausdrücklich nicht das Recht zur Weitergabe an Dritte." Sending items to the LLM classifier passes them to a third party, and the briefing rewrites them. The Impressum also reserves commercial TDM under §44b UrhG (licences: Lizenzen@funkemedien.de). `robots.txt` blocks a long list of AI agents.
- **MOPO: kept.** `robots.txt` gives `Disallow: /` to AI agents (GPTBot, ChatGPT-User, ClaudeBot, Claude-User, PerplexityBot, Google-Extended and others) but has no legal notice and no `License:` line; no `/rsl.xml`, no `tdmrep.json`; the AGB and Impressum have no RSS, TDM or AI clause. The feed URL `/feed/` redirects to `/index?lab_viewport=rss` (~70 items with descriptions).
- **hamburg.de News: removed 2026-11-01, broken.** `/rss/aktuelles/` answers 404 and no page on hamburg.de links an RSS feed any more.
- **Feuerwehr Hamburg (presseportal.de newsroom 82522): added 2026-11-01** as the third feed. presseportal's terms name AI-assisted processing as editorial use ("jede Art von Bearbeitung – sei es durch Personen oder mithilfe von künstlicher Intelligenz"); `robots.txt` blocks AI training crawlers but not `/rss/`. Open question, shared with every presseportal feed: the terms ask third-party sites that embed ots content automatically to apply (`api.presseportal.de/nutzungsbestimmungen/`: show `(ots)`, link the original, hide after 2 years).
- **Rejected replacements:** WELT Hamburg (`/rsl.xml` prohibits `ai-train ai-input`); ZEIT Hamburg, taz Nord and t-online Hamburg (each `robots.txt` reserves TDM and says "the use of robots or other automated means to access … without the express permission … is strictly prohibited").
- **The same rule applies to every city:** a blanket "automated access is prohibited without permission" notice rules a feed out (taz Berlin was removed for it), unlike a TDM reservation alone.

Köln and München feed status (checked 2026-11-01, same standard as Hamburg; the research is in the PM repo, `references/engineering/2026-11-01_koeln-muenchen-hamburg-sources.md`). Neither city had feeds before 2026-11-01.

- **WDR Rheinland (Köln): added 2026-11-01.** Atom (`/nrw/rheinland/uebersicht-rheinland-100.feed`, ~35 entries with summaries). ARD's `robots.txt` "Nutzungsvorbehalt" reserves AI training but allows "retrieval-augmented generation (RAG) or grounding, provided … the content is attributed to its original source", as for NDR and rbb24; no RSL file. The feed carries no no-archiving notice, so unlike rbb24 it keeps `storeText`. It covers the whole Rheinland (Bonn, Düsseldorf, Leverkusen too); no Köln-only WDR feed exists, so the classifier filters for relevance.
- **Kölner Stadt-Anzeiger: added 2026-11-01.** `feed.ksta.de/feed/rss/koeln/index.rss` (~260 items with descriptions). DuMont's `robots.txt` lists AI agents but disallows them only from `*/dpa/`; no RSL file, no `tdmrep.json`, no RSS terms found.
- **EXPRESS: added 2026-11-01** as tier 2 (tabloid). `feed.express.de/feed/rss/koeln/index.rss` (~140 items), same DuMont terms as the Stadt-Anzeiger.
- **Stadt Köln Pressemeldungen: added 2026-11-01** as `type: 'gov'`. 15 items; each description is only the date and a subtitle (`30. Oktober 2026, 14:58<br />…`). `robots.txt` has no AI rules; no feed terms found.
- **Kölnische Rundschau: not added.** Same DuMont newsroom as the Stadt-Anzeiger, and the newest items are identical.
- **BR24 Oberbayern (München): added 2026-11-01.** `nachrichtenfeeds.br.de/rdf/boards/UZlJdUE` is RSS 1.0 (RDF, 25 items with descriptions); the parser reads RDF since the same change. ARD robots as for WDR; `nachrichtenfeeds.br.de` has no `robots.txt`; no no-archiving notice in the feed. It covers all of Oberbayern and BR24's sport, so many items are not about München and the classifier drops them.
- **Feuerwehr München (presseportal.de newsroom 131419): added 2026-11-01**, like Feuerwehr Hamburg, with the same presseportal terms and the same open embedding-application question (`events-safety.md`, "Licence"). Polizeipräsidium München is not on presseportal and polizei.bayern.de's `robots.txt` disallows everything, so München has no police feed.
- **Not added for München, pending permission:** Abendzeitung (its RSS terms forbid "Weitergabe von Texten … an Dritte"; ask whether the LLM provider counts) and Rathaus Umschau (muenchen.de terms allow private use only; ask the Presse- und Informationsamt or rely on § 5 UrhG). **Rejected:** Süddeutsche and tz (each `robots.txt`: "the use of robots or other automated means to access … without the express permission … is strictly prohibited"; tz also `Disallow: /` for `*`).

Use Node's `fetch` to probe a feed, not curl. Some CDN front ends (BZ's Akamai, for one) return 403 to curl even for the homepage, but serve Node's fetch, which is what production uses. (The reverse can happen inside a Claude Code session: its egress proxy answered Node's fetch with "403 Blocked by egress policy" for the WDR, KStA, EXPRESS and BR hosts on 2026-11-01 while curl got the feeds. That is the session's proxy, not the publisher.)

### Favicons

News source favicons are self-hosted in `packages/web/public/favicons/`, one `<slug>.png` per feed, with the slug taken from the feed name. Polizei Berlin's feed is published on berlin.de, so `polizei-berlin.png` is the berlin.de icon; the Feuerwehr Hamburg and Feuerwehr München icons are presseportal.de's. Google's favicon service has no icon for `www.stadt-koeln.de` (404 and a generic globe), so `stadt-koeln` is fetched for the bare `stadt-koeln.de`. If the script's Node fetch is blocked (a session proxy), `curl -L 'https://www.google.com/s2/favicons?domain=<host>&sz=32' -o <slug>.png` gets the same file. When adding or removing a feed source:

1. Add (or remove) the source name → slug mapping in `FAVICON_SLUGS` in `packages/web/src/lib/news-favicons.ts`
2. Add the slug → domain mapping to `FAVICON_SOURCES` in `packages/web/scripts/fetch-favicons.ts`
3. Run `npx tsx packages/web/scripts/fetch-favicons.ts` to download the favicon
4. Commit the new `.png` file from `packages/web/public/favicons/`

`news-favicons.test.ts` reads every city config in `packages/server/src/config/cities/` and fails when a configured feed has no icon, when the map still lists a feed that is no longer configured, or when a slug has no `.png`.

### Ingestion Constraints

- Per-feed timeout: 10s (`PER_FEED_TIMEOUT`, shortened to whatever is left of the city deadline)
- Per-city deadline: 30s (`CITY_DEADLINE`; no new feed is started once it has passed)
- Concurrency: a pool of 8 workers (`CONCURRENCY`)
- Each feed's parsed items (not the raw XML) are cached under `feed:{hashString(url)}` (TTL 1200s) to avoid redundant fetches across cron cycles; a non-OK HTTP response is negatively cached for 120s; a timeout or network error is not cached, so the next cycle retries

### RSS Parser (`packages/server/src/lib/rss-parser.ts`)

Supports RSS 2.0, RSS 1.0 (RDF) and Atom formats. Returns normalized `FeedItem[]` with title, url, publishedAt, description, imageUrl. Decodes numeric (`&#228;`) and common HTML (`&nbsp;`) character references (`htmlEntities: true`) — rbb24 encodes umlauts that way. RDF items are siblings of `<channel>` under `rdf:RDF` (read from there, or from inside `channel` if a feed nests them); the date is `dc:date`, and an item without `<link>` takes its `rdf:about` as URL. RDF support was added on 2026-11-01 for BR24 Oberbayern; NDR's old `index-rss.xml` is RDF too, but Hamburg stays on the RSS 2.0 URL.
## AI Summarization

### Data Flow

1. **Summarization** (`packages/server/src/cron/summarize.ts`) — Runs every 6 hours (at :05 past), per active city, passing the city's config so the prompt gets its local time. Skipped if `OPENAI_API_KEY` not set. Takes up to 25 items with importance 0.5 or above (`selectBriefingItems` / `meetsBriefingCutoff`) from the cached news digest, in digest order. The cut-off includes 0.5 because the prompt's rubric calls 0.5–0.6 "significant" and GPT-6 Luna scores such stories exactly 0.5 — with `> 0.5` Luna halved the briefing pool. Passes titles + descriptions for richer context. Hashes the top 10 headlines to detect changes — skips API call if headlines unchanged since last summary. **Generates briefings in all languages configured for the city** (e.g. de/en/tr/ar for Berlin) in a single LLM call via structured output. Writes to cache key `{cityId}:news:summary` (TTL 86400s / 24h) and persists one row per language to Postgres with token counts.

2. **API** (`packages/server/src/routes/news.ts`) — `GET /api/:city/news/summary?lang=<code>` returns the briefing for the requested language, falling back to the city's primary language. The `lang` param is validated against `city.languages`. The response carries a machine-readable AI marker: `aiGenerated` (true whenever `briefing` has text) and `generator` (the model id that wrote it, carried in `NewsSummary.model` from generation, or from `ai_summaries.model` on a DB fallback). Keep both on any new path that serves briefing text; they are the interim Art. 50(2) measure in `ai-transparency.md`.

3. **Frontend** — Uses `useNewsSummary(cityId, i18n.language)` hook (refetch 60 min). Passes the user's selected language to the API. When the user switches language, React Query fetches the briefing in the new language. `BriefingStrip` puts `data-ai-generated="true"` on the element holding the text (invisible; the visible label is the `AiLabel` tag in the tile heading, see `ai-transparency.md`).

### LLM Integration (`packages/server/src/lib/openai.ts`, `llm-client.ts`, `llm-prompts.ts`)

- **Layout:** `openai.ts` holds the three pipelines (batching, index checks, geocoding, usage tracking). `llm-client.ts` decides model + effort per call site and makes the one structured call (`invokeStructured`). `llm-prompts.ts` holds the prompts and schemas behind request builders, so production and the model-eval harness send identical prompts.
- **Client:** LangChain `ChatOpenAI` with Zod-validated structured output (`.withStructuredOutput(zodSchema, { includeRaw: true })`, default `jsonSchema` method — never `functionCalling`, which GPT-6 only supports at effort `none`)
- **Model + effort per call site:** summaries `OPENAI_MODEL` (default `gpt-6-luna`) + `OPENAI_SUMMARY_EFFORT` (default `high`); news classification `OPENAI_FILTER_MODEL` (default `gpt-6-luna`) + `OPENAI_FILTER_EFFORT` (default `medium`); police locations `OPENAI_GEO_MODEL` (falls back to `OPENAI_FILTER_MODEL`, then `gpt-6-luna`) + `OPENAI_GEO_EFFORT` (default `none`). News and police defaults come from the 2026-09-24 eval's rules, the briefing's from the owner's blind rating (Luna at high preferred on 5 of 5 rated items). Defaults and valid values per model family: see `server.md` → Environment Variables.
- **Structured output schemas:** `BriefingSchema` (dynamic — one key per configured language, e.g. `{ briefings: { de: string, en: string, tr: string, ar: string } }`), `FilterResultSchema` (index, relevant_to_city, category, importance, locationLabel), `GeoResultSchema` (index, locationLabel)
- **Index check:** filter and police responses are numbered 0-based. `checkBatchIndices` rejects a whole response if any index is non-integer or out of range (the signature of a model counting from 1 — every verdict would land on its neighbour). A rejected news batch counts as failed and is retried next run; a rejected police response returns `null`. Duplicate indices: first occurrence wins.
- **System prompt:** Local news editor for [city], two short paragraphs separated by a blank line, focus on daily-life impact, write in all configured languages in one response.
  - **Current time:** the prompt gives the local weekday, date and time (`formatLocalMoment`, the city's `timezone`), and says to treat a transit disruption from earlier in the day as over. Without it, models guessed the weekday ("start of the week" on a Wednesday). The eval passes each input's window end as that time.
  - **Blank line between paragraphs:** the dashboard (`BriefingStrip`) splits paragraphs only on blank lines. Before the prompt asked for one, 70% of eval briefings used a single newline, which renders as one block.
  - **Length:** the owner wants about 160 words per language (140–190), but the prompt asks for ~140 (`BRIEFING_PROMPT_WORDS`). GPT-6 Luna at high effort writes 15–30% more than it is asked for: on 2026-09-24, asking ~160 gave de 171–197 and en 189–210 words, and stating "140–190" made it longer still (de 194–253). Asking ~140 gave de 150–172, en 168–194, tr 140–157, ar 157–172. If you change the model or effort, re-measure with `npm run eval:models --workspace=packages/server -- --briefing-check` (see `model-eval.md`). English always runs longest.
- **Location extraction:** Filter prompt pushes LLM for district/neighborhood-level specificity (not bare city names). Includes examples mapping organizations to known addresses (e.g. "Senat" -> "Rotes Rathaus, Mitte"). Post-processing discards labels that are just the bare city name or "city, country" format before geocoding.
- **Usage tracking:** In-memory totals per model and city, keyed `{model}:{city}` (input/output tokens, call count). Exposed via `getUsageStats()` on the health endpoint.
- **Cost estimate:** per-model prices in `MODEL_PRICING` (`llm-client.ts`); unknown models fall back to $1.00/$4.00 per 1M tokens
- **Timing:** Logs duration + token counts per call via logger

## Key Types

```typescript
interface NewsItem {
  id: string;           // hashString (SHA-256, 12 hex chars) of URL + title
  title: string;
  url: string;
  publishedAt: string;
  sourceName: string;
  sourceUrl: string;
  description?: string;
  category: string;     // LLM-assigned (transit, crime, politics, culture, economy, sports, local, weather)
  tier: number;         // 1 (primary) to 3 (tertiary)
  lang: string;
  location?: { lat: number; lon: number; label?: string };
  importance?: number;  // 0–1, LLM-assigned (0.5 default for unassessed)
}

// Extended type with LLM assessment, used for DB persistence
type PersistedNewsItem = NewsItem & {
  assessment?: { relevant_to_city?: boolean; importance?: number; category?: string };
}

interface NewsDigest {
  items: NewsItem[];
  categories: Record<string, NewsItem[]>;
  updatedAt: string;
}

interface NewsSummary {
  briefings: Record<string, string>;  // keyed by language code (de, en, tr, ar)
  generatedAt: string;
  headlineCount: number;
  cached: boolean;
  model: string;                      // model that wrote the briefings → API `generator`
}
```

## DB Schema

- `newsItems` table — cityId, hash (dedup key via unique index `news_city_hash_idx`), title, url, publishedAt, sourceName, sourceUrl, description (null for a `storeText: false` feed such as rbb24), category, tier, lang, relevantToCity (bool), importance (real, 0–1), lat, lon, locationLabel, fetchedAt. UPSERT on (cityId, hash); a conflict refreshes description, the verdict fields, location and fetchedAt. 3-day retention (`cron/data-retention.ts`). The cache-miss read (`loadNewsItems` in `db/reads.ts`) returns the 200 most recent rows with `relevantToCity = true`.
- `aiSummaries` table — cityId, lang, headlineHash, summary, model, inputTokens, outputTokens, generatedAt. One row per language per generation batch (rows share the same generatedAt). INSERT-only. Retention at most 7 days (`cron/data-retention.ts`); the same job also deletes a city's briefings once that city has no `newsItems` rows left. `headlineHash` is only the change detector for the top-10 briefing titles (`cron/summarize.ts`), not a reference to any `newsItems.hash`: never join the two tables on it. Until 2026-09-25 the orphan cleanup did exactly that, and so deleted every stored briefing on each run.

## Drop Logic

`applyDropLogic()` (exported from `ingest-feeds.ts`) filters out items the LLM assessed as irrelevant. Shared by the cron job, warm-cache, and the digest route. Drops all items where `relevant_to_city === false`. Items without assessment default to importance 0.5. Map markers require importance >= 0.5; the briefing requires importance >= 0.5 (see AI Summarization).
