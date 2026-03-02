# Milestone 00 — Licensing & Attribution

**Goal:** Set up the new repo with correct AGPL-3.0 licensing and attribution for code derived from worldmonitor.

This must be done FIRST, before any code is written.

---

## The situation

- `worldmonitor` is licensed **AGPL-3.0-only**, copyright Elie Habib 2024-2026
- We are a **separate party** building a new product that adapts code and patterns from it
- AGPL-3.0 is a strong copyleft license with a **network use clause** (Section 13)

## What AGPL-3.0 requires

### 1. The new repo must be AGPL-3.0

Any code copied or substantially adapted from worldmonitor makes the derivative work subject to AGPL-3.0. Since the plans call for porting `cachedFetchJson`, the keyword classifier, the hash function, the rate-gate pattern, and other code — the new repo **must** be licensed AGPL-3.0 (or AGPL-3.0-or-later).

This is non-negotiable unless you rewrite everything from scratch without referencing the original code.

### 2. Source availability for network users (Section 13)

Since city-monitor is a public website, **every user who interacts with it** must be able to get the source code. This means:

- The repo must be public (e.g., on GitHub), OR
- The website must provide a prominent link to download the source code

Practically: keep the GitHub repo public and add a "Source Code" link in the dashboard footer.

### 3. Preserve copyright notices

Every file that contains code copied or adapted from worldmonitor must retain the original copyright notice. Files with entirely new code get your own copyright.

### 4. State changes

You must clearly note that you modified the original code. This is typically done in a NOTICE or CHANGES file.

---

## What to put in the new repo

### LICENSE file

Copy the full AGPL-3.0 license text. Change the header to:

```
City Monitor — Real-time city dashboard
Copyright (C) 2026 [Your Name]

Based on World Monitor (https://github.com/[owner]/worldmonitor)
Copyright (C) 2024-2026 Elie Habib

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.
...
```

### NOTICE file

```
City Monitor
============

This project is derived from World Monitor by Elie Habib,
licensed under the GNU Affero General Public License v3.0.

Original project: https://github.com/[owner]/worldmonitor
Original license: AGPL-3.0-only

The following components were adapted from the original project:

- Cache layer with in-flight coalescing (server/_shared/redis.ts)
  → packages/server/src/lib/cache.ts

- FNV-1a hash function (server/_shared/hash.ts)
  → packages/server/src/lib/hash.ts

- Rate-gate serial queue (server/_shared/constants.ts → yahooGate)
  → packages/server/src/lib/rate-gate.ts

- Keyword news classifier (server/worldmonitor/news/v1/_classifier.ts)
  → packages/server/src/lib/classifier.ts

- RSS feed tier/type metadata structure (src/config/feeds.ts)
  → packages/server/src/config/ and packages/web/src/config/

- Summarization prompt patterns (server/worldmonitor/news/v1/summarize-article.ts)
  → packages/server/src/lib/openai.ts

- Feed ingestion patterns (server/worldmonitor/news/v1/list-feed-digest.ts)
  → packages/server/src/cron/ingest-feeds.ts

All adapted code has been modified for a city-level dashboard context.
No code was copied verbatim without modification.

All other code is original work by [Your Name].
```

### Per-file headers (for adapted files)

Files that are adapted from worldmonitor should include a header comment:

```typescript
/**
 * Cache layer with in-flight coalescing and negative caching.
 *
 * Adapted from World Monitor (AGPL-3.0)
 * Original: server/_shared/redis.ts
 * Copyright (C) 2024-2026 Elie Habib
 *
 * Modifications:
 * - Added in-memory primary cache (original was Redis-only)
 * - Made Redis optional
 * - Removed Vercel-specific env key prefixing
 */
```

Files that are entirely new (React components, city configs, etc.) get your own header:

```typescript
/**
 * Copyright (C) 2026 [Your Name]
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
```

### package.json

```json
{
  "license": "AGPL-3.0-or-later",
}
```

### Dashboard footer

Add a visible link:

```
Source Code: github.com/[you]/city-monitor | Based on World Monitor by Elie Habib | AGPL-3.0
```

This satisfies Section 13 (network use source availability).

---

## What you CAN do freely

- **Use any architecture or pattern** — ideas and algorithms aren't copyrightable. "Use an in-memory cache with coalescing" is an idea. The specific TypeScript implementation is copyrightable code.
- **Use the same third-party libraries** — they have their own licenses (MIT, Apache, etc.). Using MapLibre, Vite, etc. has nothing to do with worldmonitor's license.
- **Write entirely new implementations** of the same concepts. If you write `cachedFetch` from scratch without referencing the original code, it's yours. But the plans explicitly call for porting code, so the AGPL applies.
- **Choose AGPL-3.0-or-later** instead of AGPL-3.0-only. This gives you (and others) the option to adopt future GPL versions.
- **Add commercial use.** AGPL doesn't prevent commercial use — it just requires source availability.

## What you CANNOT do

- Use a permissive license (MIT, Apache, BSD) for the new repo if it contains AGPL-derived code
- Remove the original copyright notices from adapted code
- Make the source unavailable to users of the public website
- Claim the adapted code as solely your own work

---

## The "clean room" alternative

If you want a non-AGPL license, you could do a "clean room" approach:
1. Read worldmonitor to understand the **concepts** (caching, coalescing, classification)
2. Close the worldmonitor code
3. Write all implementations from scratch, from memory, without referencing the original files
4. Don't copy `.worldmonitor/` into the repo at all

This is legally defensible but slower. The plans as written assume direct porting (referencing `.worldmonitor/` files), which triggers AGPL.

---

## Done when

- [ ] LICENSE file with dual copyright header (yours + Elie Habib)
- [ ] NOTICE file listing all adapted components with original → new file mapping
- [ ] package.json has `"license": "AGPL-3.0-or-later"`
- [ ] Per-file attribution headers ready (template in this plan)
- [ ] Footer component includes source code link (implemented in milestone 03)
