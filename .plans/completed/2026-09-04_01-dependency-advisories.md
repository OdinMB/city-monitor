# Dependency advisory remediation — 2026-09-04

Baseline at time of writing: `npm audit` reports 28 vulnerable package entries
(2 low, 12 moderate, 13 high, 1 critical) carrying ~55 distinct GHSA ids.
Dependabot reports 44 alerts; that is a counting difference (one alert per
advisory per manifest, across four `package.json` files), not a scan difference.
There is no `.github/dependabot.yml` — this is GitHub's default alerting.

## Triage conclusion

No advisory in the set gives an unauthenticated internet caller a way to read
data, execute code, or take down the deployed product. Verified against the
source, not from advisory titles:

- **ip-address** (via `express-rate-limit`) is the only advisory package whose
  code runs on every production request. Both flaws are dead ends: the XSS one
  needs `Address6`'s HTML-emitting methods, which the key generator never calls;
  the SSRF one needs the parsed address used for a routing or trust decision,
  whereas it is only a bucket label. Worst case is rate-limit bucket confusion
  for IPv6 clients. Note the limiter is only mounted when `NODE_ENV=production`
  (`app.ts:80-83`).
- **react-router** carries 12 of the advisories — the largest single block and
  the main driver of the Dependabot count. Ten are SSR/RSC/framework-mode code
  this app never loads: `main.tsx` uses `createRoot` + declarative
  `<BrowserRouter>`; `App.tsx` imports only `Routes`/`Route`/`useParams`/
  `Navigate`; there are no loaders, actions, or `useNavigate`. The two
  open-redirect bugs do ship, but every `to=` is a literal or `` `/${cityId}` ``
  behind `getCityConfig`, which gates on `ACTIVE_CITY_IDS`. **That safety is an
  invariant of `getCityConfig` — activating Hamburg or moving city ids to env
  config re-opens GHSA-wrjc-x8rr-h8h6 on 7.13.1.** Another reason to take the
  bump now.
- **Loaded on the API server but never invoked (7):** `tmp`, `uuid`,
  `fast-xml-builder`, `qs`, `body-parser`, `brace-expansion`, `ws`. In each case
  the vulnerable function is never called — population ingestion uses
  `wb.xlsx.load(Buffer)` rather than the streaming/`tmp` path; the code only
  ever constructs `XMLParser`, never `XMLBuilder`; Express 5 defaults its query
  parser to `simple` and nothing sets `extended`; `express.json()` is bare so it
  gets the valid 100kb default (the advisory needs an *invalid* limit); `ws` is
  installed only as an optional peer of `openai`/`langsmith` and is imported by
  neither.
- **Build/dev toolchain (the rest):** postcss, nanoid, @babel/core, esbuild,
  turbo, browserslist, js-yaml, @humanfs/node, sharp, fflate, vitest.

**The lone CRITICAL (vitest) is inert:** it requires the Vitest UI server to be
listening. `@vitest/ui` is not installed, both scripts are `vitest run`, and
neither `vitest.config.ts` enables `api`/`ui`.

**`vite` is the only advisory live anywhere right now**, and on the developer
machine rather than the product: both flaws are Windows dev-server issues, and
CLAUDE.md says port 5173 is permanently up on Windows 11.

### Do not treat "build-time" as the safe category

This repo is public (4 forks) and `.github/workflows/ci.yml` triggers on
`pull_request`, so fork PRs *do* feed attacker-authored files to eslint,
typescript-eslint, tsc, vitest, vite, babel, postcss and turbo — and `npm ci`
runs install lifecycle scripts from the PR's own lockfile (sharp declares an
`install` hook, esbuild a `postinstall`). Turbo's advisory is specifically
"local code execution during Yarn Berry detection", and a PR adding
`.yarnrc.yml` + `.yarn/releases/*.cjs` is exactly that precondition.

These still deprioritize, but for the correct reason: that runner already grants
a fork PR arbitrary code execution through its own test files, the token is
read-only for forks, `ci.yml` references no secrets, and fork-PR caches are
scoped away from `main`. So the advisories add no capability an attacker does not
already have, and there is no route to production (Render builds independently
from `main`). Also note that for `packages/web` the whole build toolchain sits in
`devDependencies` and Render's static build emits the exact bytes visitors run —
build-time has a *shorter* path into a browser than server runtime does.

## Sequence

**Step 0 — stop the dev servers first.** Steps 1–5 each reify `node_modules`, and
on Windows a running Vite dev server holds an exclusive lock on
`node_modules/@esbuild/win32-x64/esbuild.exe` (a ~10MB native binary Vite spawns
as a long-lived child). Kill Vite (5173) and the API (3001) and leave them down
for the whole sequence. `EPERM`/`EBUSY`/`EEXIST` under `node_modules` during any
step is a stale file handle, not a dependency conflict: stop every node process,
delete `node_modules/.vite`, re-run that step.

**Step 1 — green baseline.** `npm run typecheck && npm run lint && npm test`.
If not green, stop; later failures cannot otherwise be attributed.

**Step 2 — `npm audit fix`** (NO `--force`). Resolves 20 of 28 rows, including
all 12 react-router advisories, the ip-address/express-rate-limit row, the vite
row, the vitest CRITICAL, and qs / body-parser / ws / tmp / fast-xml-builder /
postcss / nanoid / babel / turbo / js-yaml / brace-expansion. Lockfile only — no
manifest or source edits, because every fix version already sits inside a
declared `^` range. Expected after: 0 critical, 1 high, 7 moderate. Re-run the
check command.

**Step 3 — `npm update tsx --workspace=packages/server`.** Moves tsx to 4.23.13,
which declares `esbuild: ~0.28.0` and resolves to 0.28.2, outside the vulnerable
range. Removes one of the two vulnerable esbuild copies; `npm audit fix` skips it
because npm attributes the row to a different chain. In range for every
dependent (server `^4`, drizzle-kit `^4.21.0`, vite peer `^4.8.1`). No code
change.

**Step 4 — uuid, without the exceljs trap.** Add to the ROOT `package.json`:
`"overrides": { "uuid": "^11.1.1" }`, then `npm install`. Clears three rows
(uuid, exceljs, node-cron) — the latter two carry no flaws of their own. Use
11.1.1 specifically: it is the highest 11.x and the advisory's fix floor; 14.x
drops the module format exceljs needs. An override is required rather than a
range bump because node-cron@3.0.3 pins `uuid` to exactly `8.3.2`. Verified both
consumers use only `v4()` with no `buf` argument. Re-run checks — the population
ingestion test covers the exceljs path.

**Step 5 — `npm install --save-dev sharp@^0.35.4 --workspace=packages/web`.**
Clears the last high row. This is the deliberate version of one `--force` trap.
Safe: the sole consumer (`packages/web/scripts/optimize-images.mjs`) uses only
`metadata()`, `.png/.jpeg/.webp`, `.toBuffer/.toFile` — none of the 0.35.0
breaking surfaces; prebuilt binaries exist for win32-x64, linux-x64 and
linuxmusl-x64; engines `>=20.9.0` against repo `>=22`. Optionally confirm with
`npm run images:info --workspace=packages/web`.

**Step 6 (optional, the only step needing code).** `npm install
node-cron@^4.6.0 --workspace=packages/server` and `npm uninstall
@types/node-cron --workspace=packages/server`. v4 has zero production
dependencies and moves off an unmaintained v3. **Requires:**
`packages/server/src/lib/scheduler.ts:1` becomes
`import cron, { type ScheduledTask } from 'node-cron';` and `:26` becomes
`const tasks: ScheduledTask[] = [];` — v4's default export is a value, so
`cron.ScheduledTask` stops resolving as a type namespace. The existing
`scheduler.test.ts` mock stays valid. Removing `@types/node-cron` is hygiene, not
a conflict fix (v4 ships its own types, which TypeScript prefers).
**Keep the Step 4 override** — exceljs still needs it.

**Step 7 — verify and commit.** `npm run typecheck && npm run lint && npm test`,
then `npm audit`. Expect 0 critical, 0 high, 4 moderate. The commit spans three
manifests plus the lockfile: root `package.json` (overrides),
`packages/web/package.json` (sharp), `packages/server/package.json` (node-cron,
minus `@types/node-cron`), `package-lock.json`, and `scheduler.ts` if Step 6 was
taken. Restart the dev servers afterwards — that is also what makes the patched
Vite 6.4.3 the code actually serving 5173.

**Step 8 — CI hardening (one line).** `ci.yml` has no top-level `permissions:`
block. Add `permissions: contents: read` so the containment described above is
explicit in the file rather than dependent on repo defaults. Record that
switching this workflow to `pull_request_target`, or introducing secrets into
it, is a security change requiring review — because untrusted code already runs
in these jobs.

**Step 9 (optional) — gate CI at `npm audit --audit-level=high`** so the next
high-severity advisory surfaces automatically. Satisfiable: only 4 moderates
remain.

## Accepted residual

Four moderate rows cannot be fixed: two deprecated `@esbuild-kit` packages,
`drizzle-kit`, and an old esbuild beneath them. drizzle-kit 0.31.10 is current
and still declares the dependency; only an unreleased 1.0 preview drops it, and
that tool runs `db:migrate` on every Render deploy, so a preview is not an
acceptable trade. Verified dead code: `esbuild-kit` appears in drizzle-kit's
`package.json` only — no `.js`/`.cjs`/`.mjs` file references it. **Accept and
document; revisit when drizzle-kit 1.0 ships stable. Never accept a drizzle-kit
downgrade to zero the number.**

## Separate finding — not a dependency issue

`packages/server/src` contains **zero** URL-scheme checks (no `new URL(`, no
`startsWith('http`, no protocol comparison), and eight frontend `href` sites
render addresses taken straight from ingested third-party feeds:
`NewsStrip.tsx:151`, `NewsMarquee.tsx:19`, `EventsStrip.tsx:95`,
`SafetyStrip.tsx:34`, `PoliticalStrip.tsx:65`, `CouncilMeetingsStrip.tsx:83`,
`AppointmentsStrip.tsx:145`, `SourcesPage.tsx:298`. `render.yaml`'s CSP uses
`script-src 'self' 'unsafe-inline'`, which does not block a `javascript:` href.

Current exposure is low: the feeds that actually populate these hrefs are press
RSS, Ticketmaster, abgeordnetenwatch, OParl and service.berlin.de — none
open-write. (The open-write sources in the system — Overpass/OpenStreetMap for
AEDs, Sensor.Community for noise, community-run transport.rest — do not feed an
href today.) It is a defence-in-depth gap that grows quietly as feeds are added.

Fix: one shared helper returning the URL only when its protocol is `http:` or
`https:`, applied at those eight sites, or at ingest. Needs its own ticket.

## Checked, no action

The rate limiter behind Render's static-site `/api/*` rewrite was suspected of
keying every visitor to the same bucket (which would share one 100/min limit
across the whole world). Live check on 2026-09-04 returned
`ratelimit-remaining: 99` on both the proxied and the direct host, so there is no
evidence of a globally shared bucket. Not conclusive under zero traffic — worth a
deliberate load check only if 429s are ever reported.
