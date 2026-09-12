# PrepTracker remediation plan

Companion to [ENGINEERING_AUDIT.md](ENGINEERING_AUDIT.md). Each task lists severity, reason,
files, scope (S = under half a day, M = one to two days, L = three days or more), what it
depends on, and how to prove it is done. Tasks within a phase are ordered; phases are ordered
by risk, not by effort.

---

## Status — 2026-09-12

Phases 0 to 5 are implemented on `fix/engineering-audit-remediation`; what each change closes
is recorded in [IMPLEMENTATION_LOG.md](IMPLEMENTATION_LOG.md).

| Phase | State |
| --- | --- |
| 0 · Critical | Done. The repository was pushed and the redesign merged as pull request #1 before this work began; `v0.1.0` tags that baseline and `package.json` follows it. |
| 1 · Data integrity and security | Done, except 1.11's off-host copy and restore verification, which need a destination and a key only the owner can provide. |
| 2 · Architecture and maintainability | Done except **2.4** (splitting `day-service.ts`, `prep.ts`, `plan.ts`) and the cast half of **2.2**. Both are deferred deliberately — see below. |
| 3 · Testing and CI | Done. 422 unit and integration tests, 4 end-to-end journeys, and a workflow gating pull requests. |
| 4 · Mobile and PWA | Done, except the manifest `screenshots` entries, which need screenshot assets that do not exist yet. |
| 5 · Deployment and backup | Done. The runtime image no longer carries the Prisma CLI, migrations run as a one-shot service, and backups ship with the deployment. |
| 6 · Polish and developer experience | Partly. Licence, editorconfig, nvmrc, security policy, issue templates and Dependabot are in; Prettier and lint-staged (6.2) are not. |

### Deliberately deferred

- **2.4, splitting the three largest server files.** The reconcile rewrite in 1.1 was the
  reason to do it, and that is done; what remains is moving code between files with no
  behaviour change. It is the highest-risk-to-benefit item in the plan and belongs in its own
  pull request where the diff is reviewable as a pure move.
- **The `as unknown as Parameters<...>` casts in 2.2.** Removing them properly means exporting
  a `z.input` type per action and threading it through twenty-two call sites. The double-fetch
  half of 2.2, which was the P1, is done.
- **`MealPlan.archivedAt`** stays despite never being written. Dropping a column would make
  every backup taken before today fail the new validation, which costs more than a dead column.
- **The partial unique index on one active plan per user.** Prisma cannot express a partial
  index, so it would have to be raw SQL that the next `migrate dev` tries to drop. The
  transaction in `activateMealPlan` already prevents the case that matters.

---



---

## Phase 0 · Critical (do before any other work)

### 0.1 Push the repository

- **Severity:** P0
- **Reason:** The remote has no refs. The project exists only on this machine.
- **Files:** none
- **Scope:** S
- **Depends on:** nothing
- **Validation:** `git ls-remote --heads origin` lists `main` and `feature/ux-redesign`.

```bash
git push -u origin main
git push -u origin feature/ux-redesign
```



### 0.2 Open the redesign as a pull request and merge it

- **Severity:** P0 (unblocks everything else)
- **Reason:** `main` must carry the current code before CI or protection can mean anything.
The redesign is finished, verified and documented; a squash or rebase merge now, with the
PR template filled in, is the first PR in the project's history.
- **Files:** none
- **Scope:** S
- **Depends on:** 0.1
- **Validation:** `main` at the redesign tip; branch deleted; `docker compose up --build` from
`main` comes up healthy.



### 0.3 Tag `v0.1.0`

- **Severity:** P1
- **Reason:** `package.json` claims `1.0.0` with no release. Reset to `0.1.0` so the running
version is traceable and 1.0 is a milestone with criteria (Phase 5).
- **Files:** `package.json`, new `CHANGELOG.md`
- **Scope:** S
- **Depends on:** 0.2
- **Validation:** `git tag` shows `v0.1.0`; image built as `preptracker:v0.1.0`.

---



## Phase 1 · Data integrity and security



### 1.1 Rebuild-day must not rewrite history

- **Severity:** P1 (audit section 5)
- **Reason:** `regenerateDay` deletes the day's meals and supplements (cascading the
completion audit), re-portions eaten meals from the current plan, drops logged meals the
new day type excludes, and reports "Completions were kept".
- **Files:** `src/lib/server/day-service.ts` (`ensureDailyPlan` 290–579),
`src/lib/actions/day.ts` (`regenerateDay`, `setDayType`), `prisma/schema.prisma`
(`MealCompletion`, `SupplementCompletion` relations), `tests/integration/day-service.test.ts`
- **Scope:** M
- **Depends on:** nothing
- **Change:**
  1. `keepLoggedMeals` defaults to `true`; remove the option or make it `force: true`.
  2. Reconcile update-in-place keyed by `sourceMealId ?? name`: update PENDING meals'
    items/times, insert new meals, leave COMPLETED/SKIPPED meals and their items untouched,
     delete only PENDING meals that no longer exist.
  3. Change `MealCompletion.dailyMeal` and `SupplementCompletion.dailySupplement` to
    `onDelete: Restrict` so the invariant is enforced by the database (migration).
  4. Refuse `regenerate` for `date < todayKey()` unless `force` is passed; the UI only offers
    it for today.
  5. Reword the success message to what actually happened.
- **Validation:** new integration tests: rebuild after completing a substituted meal keeps its
items and audit rows; switching Training→Rest after eating the pre-workout meal keeps that
meal; rebuild of a past date is refused. Existing 124 integration tests still pass.



### 1.2 Water target cannot rewrite a past day

- **Severity:** P2
- **Files:** `src/lib/actions/water.ts:112-141`
- **Scope:** S
- **Change:** ignore `date`; when `applyToToday`, use `todayKey()` server-side.
- **Validation:** unit/integration test that `updateWaterTarget` with a past date leaves that
`DailyPlan.waterTargetMl` unchanged.



### 1.3 Prep "start with X g raw" uses the cooked target only

- **Severity:** P1 (audit F1)
- **Files:** `src/lib/domain/grocery.ts` (`GroceryLine`, lines 328–351, 588–601),
`src/lib/actions/prep.ts:108-141`, `tests/unit/grocery.test.ts`
- **Scope:** S
- **Change:** add `rawForCookedQty` (= `cookedToRaw(cookedBase)` only) to `GroceryLine`;
`cookingRequirements` and the prep task text use it; keep `rawQty` as the purchase total or
rename it `purchaseQty`.
- **Validation:** unit test: chicken 75 %, 175 g COOKED + 100 g RAW, 1 day → cook task says
233.33 g raw, shopping says 333.33 g.



### 1.4 Non-finite quantities produce unknown macros, not zero

- **Severity:** P1 (audit F2)
- **Files:** `src/lib/domain/nutrition.ts:77-79`, `src/lib/domain/materialise.ts:94`,
`tests/unit/domain-misc.test.ts`
- **Scope:** S
- **Change:** guard `Number.isFinite(factor)` → `EMPTY_MACROS`; materialisation skips
non-finite quantities with a warning.
- **Validation:** unit tests for NaN/Infinity quantity and NaN basis returning nulls.



### 1.5 Local date, not UTC (I am in Victoria, BC so use Pacific Time), for refrigerate-on and yield history

- **Severity:** P1 (audit F3)
- **Files:** `src/lib/actions/prep.ts:510`, `src/lib/queries/analytics.ts:261`,
`src/app/api/export/[kind]/route.ts:21` (filename only, cosmetic)
- **Scope:** S
- **Change:** `todayKey()` and `toDayKey(row.recordedAt)`.
- **Validation:** integration test with `TZ=America/Los_Angeles` and a fake clock at 20:00
local asserting the stored date is today.



### 1.6 Validate backup files before restoring

- **Severity:** P1 (SEC-1)
- **Files:** `src/lib/backup/core.ts`, `src/lib/actions/data.ts`, `scripts/restore.ts`,
new `src/lib/backup/schema.ts`, `tests/integration/backup.test.ts`
- **Scope:** M
- **Depends on:** nothing
- **Change:** Zod schema per table (generate from the Prisma DMMF or hand-write with
`z.object({...}).strict()`); `version: z.number().int()`; force every `userId` to the
restoring user (or reject rows whose `userId` differs); replace the `as unknown as` delegate
map with a `Prisma.ModelName`-keyed typed map; take `pg_advisory_xact_lock` on the user for
the duration; return a generic message on failure.
- **Validation:** tests: unknown column rejected with a readable message before any delete;
foreign `userId` rejected; concurrent restore serialised; existing round-trip still passes.



### 1.7 Scope every client-supplied id

- **Severity:** P1 / P2 (SEC-2, SEC-3)
- **Files:** `src/lib/actions/plan.ts:406-420` (`reorderIngredients`),
`src/lib/actions/prep.ts:100` (`groceryWeekId`), `:554` (`foodId`)
- **Scope:** S
- **Change:** `findMany({ id: { in: ids }, mealId })` and compare counts, as `reorderMeals`
does; `groceryWeek.findFirst({ id, userId })`; `food.findFirst({ id, userId })`.
- **Validation:** integration tests that a second user's ids are rejected.



### 1.8 Sessions, passwords, login

- **Severity:** P2 (SEC-4, SEC-5, SEC-6, SEC-7, SEC-8)
- **Files:** `src/lib/auth/session.ts`, `src/lib/auth/password.ts`, `src/lib/auth/guards.ts`,
`src/lib/actions/auth.ts`, `prisma/schema.prisma` (`User.sessionVersion Int @default(0)`),
`src/lib/db.ts` or a small `src/lib/auth/throttle.ts`
- **Scope:** M
- **Change:**
  - `sessionVersion` claim in the JWT; `getCurrentUser` compares with the row; `changePassword`
  increments it (invalidates every other session).
  - Parse `$N$r$p$` from the stored hash and pass `{ N, r, p, maxmem }` to `scrypt`; raise
  `PARAMS.N` to `131072` for new hashes; rehash on successful login when parameters are below
  current.
  - Per-username and per-IP throttle (in-memory token bucket is enough for one process; 5
  failures → 30 s delay, doubling).
  - `next`: resolve with `new URL(next, origin)`, require same origin, reject `\`, reject
  `/login`.
  - Refuse to start when `AUTH_SECRET` equals a known placeholder or has fewer than 128 bits of
  estimated entropy.
- **Validation:** unit tests for the `next` guard and hash parameter round-trip; integration
test that a token issued before a password change is rejected; manual test of throttling.



### 1.9 Error messages and logs

- **Severity:** P2 (SEC-9, E1, E2, L1)
- **Files:** `src/lib/actions/result.ts`, new `src/lib/errors.ts`
- **Scope:** S
- **Change:** `UserFacingError` class; `runAction` returns `error.message` only for that class,
the generic sentence otherwise; log `{ name, code, message: error.name === 'UserFacingError' ? undefined : error.message, stack }` without the error object. Convert the three throwing
"not found" helpers to `UserFacingError`. Consider `unstable_rethrow` from `next/navigation`
instead of digest sniffing.
- **Validation:** unit test that a `PrismaClientKnownRequestError` yields the generic message.



### 1.10 Database constraints and indexes

- **Severity:** P2
- **Files:** `prisma/schema.prisma`, new migration
- **Scope:** S
- **Change:** `@@index` on the twelve FK columns listed in audit section 6;
`MealIngredient.food` → `onDelete: Restrict` with `deleteFood` first removing the ingredient
lines inside a transaction after a confirmation that names the meals; drop the redundant
`DailyPlan` index; partial unique index on `(userId) WHERE isActive` via raw SQL in the
migration.
- **Validation:** `prisma migrate dev` on a copy of production data; `deleteFood` integration
test updated.



### 1.11 Backups: automate, copy off-host, verify

- **Severity:** P1 (audit section 14)
- **Files:** `docker-compose.yml` (new `backup` service or a host `systemd` timer),
`scripts/backup-db.sh`, `docs/DEPLOYMENT.md`, new `docs/DISASTER_RECOVERY.md`
- **Scope:** M
- **Depends on:** nothing
- **Change:**
  - Nightly `pg_dump | gzip` into `./backups` with 30-day retention, run by a compose service
  (`postgres:16-alpine` image, `cron` loop) so it ships with the deployment.
  - Weekly copy to a second location (another machine on the tailnet via `rsync`, or an
  object store via `rclone`), encrypted with `age` or `gpg`.
  - Weekly restore test into a scratch database with a row-count check; failure notifies.
  - Note in the export UI that the JSON file contains the password hash.
  - Entrypoint refuses `prisma migrate deploy` when a pending migration exists and no dump
  newer than the image build exists (override with `SKIP_BACKUP_GATE=1`).
- **Validation:** after 48 h, two dated dumps exist locally and remotely; the restore test job
has logged a success; a deliberate migration without a dump is refused.



### 1.12 Disaster recovery runbook

- **Severity:** P2
- **Files:** new `docs/DISASTER_RECOVERY.md`
- **Scope:** S
- **Content:** what must exist to rebuild completely (the git remote, `.env`, the latest
dump); step-by-step recovery for: server failure (new host, clone, restore `.env`,
`compose up`, `psql < dump`), database corruption (stop app, restore into fresh volume),
accidental delete (restore last dump into scratch DB, extract rows, or JSON restore), failed
migration (`migrate status`, restore pre-upgrade dump, checkout previous tag), broken
deployment (checkout previous tag, rebuild), lost phone (nothing lives on the phone; sign in
again; revoke sessions via `sessionVersion`), corrupted Docker volume (`down`, remove volume,
`up`, restore dump).
- **Validation:** performed once end-to-end on a scratch host or VM and dated in the document.

---



## Phase 2 · Architecture and maintainability



### 2.1 Error boundaries and honest action failure

- **Severity:** P1 (UI-1, UI-2)
- **Files:** new `src/app/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`,
`src/app/(app)/error.tsx`, `src/app/(app)/not-found.tsx`; `src/lib/hooks/use-action.ts`;
`day-state-control.tsx`, `supplement-groups.tsx`, `workout-line.tsx`, `shopping-mode.tsx`
- **Scope:** S
- **Change:** `try/catch` around the awaited action inside the transition; on rejection, toast
"Couldn't reach the server. Your change is still on screen." and roll back optimistic state.
Route the four hand-rolled sites through `useAction`. Error pages keep the bottom nav and
offer "Try again" / "Back to Today".
- **Validation:** Playwright test with `page.route('**', abort)` after load: tapping "Mark
eaten" shows the toast and the page survives.



### 2.2 One form pattern, one optimistic pattern, one invalidation

- **Severity:** P2 / P1 (double RSC fetch)
- **Files:** 35 client call sites with `router.refresh()`; 22 sites with `as unknown as`;
`use-action.ts`
- **Scope:** M
- **Change:** `useAction` becomes the single client entry point, typed so inputs are the
action's Zod *input* type (`z.input<typeof schema>`) and no cast is needed; remove
`router.refresh()` where the action already revalidates; a `useOptimisticAction` helper for
water, supplements, shopping, meal completion.
- **Validation:** grep counts of `router.refresh()` and `as unknown as Parameters` reach zero
outside deliberate exceptions; network tab shows one RSC fetch per tap.



### 2.3 Move domain math out of components

- **Severity:** P2
- **Files:** `batch-card.tsx:96,102`, `water-card.tsx:83-85`, two grocery pages,
`workout-line.tsx:30-37`, `inventory-manager.tsx:246`; targets in `src/lib/domain/*`
- **Scope:** S
- **Validation:** unit tests for the moved functions; the live yield preview equals the saved
value.



### 2.4 Split the three largest server files and extract services

- **Severity:** P2
- **Files:** `day-service.ts` → `day/context.ts`, `day/materialise.ts`, `day/reconcile.ts`;
`actions/prep.ts` → `prep.ts`, `yields.ts`, `storage.ts`; business rules from
`groceries.ts:83-98`, `prep.ts:108-141`, `settings.ts:175-223`, `groceries.ts:304-330` into
`src/lib/server/*` or `src/lib/domain/*`
- **Scope:** L
- **Depends on:** 1.1 (do the reconcile rewrite as part of this split, not before and again
after)
- **Validation:** no behaviour change; all tests pass; each file under 400 lines.



### 2.5 Shared action helpers

- **Severity:** P3
- **Files:** `src/lib/validation/common.ts` (`idSchema`, `optionalDayKey` reuse),
new `src/lib/actions/shared.ts` (`findOwnedOrFail`, `revalidate(area)` map)
- **Scope:** S
- **Validation:** 8 `idSchema` declarations → 1; 9 `revalidateX` → 1 map.



### 2.6 Reconcile the duplicated rules

- **Severity:** P2 (F5, F8/F9, F10, F11, F6)
- **Files:** `schedule.ts`, `reminders.ts`, `time.ts`, `yield.ts`, `queries/analytics.ts`,
`grocery-service.ts`, `adherence.ts`
- **Scope:** M
- **Change:** one `isOverdue(scheduled, now, grace)`; History uses `effectiveYield` (decide
whether MANUAL rows belong in the mean and document it); supplement lines pass through
`applyInventory`; period stats exclude today unless all meals are resolved (update the test
that locks the old behaviour); document or align the weighting of `overallPercent`.
- **Validation:** updated unit tests; the two "overdue" surfaces agree.



### 2.7 Remove dead code and align docs

- **Severity:** P3
- **Files:** `yield.ts:158-198`, `grocery-service.ts:198-200`, `day-service.ts:655`,
`workout.ts:385-392`, `progress-ring.tsx`, sheet animation classes (either install
`tw-animate-css` or remove), `MealPlan.archivedAt`; `docs/ARCHITECTURE.md` (35 models),
`README.md` (32 → 35), `docs/DEPLOYMENT.md` (image size)
- **Scope:** S



### 2.8 Rename `middleware.ts` to `proxy.ts`

- **Severity:** P3
- **Files:** `src/middleware.ts`
- **Scope:** S (`npx @next/codemod@canary middleware-to-proxy .`)
- **Validation:** build has no deprecation warning; unauthenticated `/today` still redirects.

---



## Phase 3 · Testing and CI



### 3.1 Continuous integration

- **Severity:** P1
- **Files:** new `.github/workflows/ci.yml`, `.github/dependabot.yml`
- **Scope:** S
- **Depends on:** 0.1
- **Workflow:** on `pull_request` and `push` to `main`: `actions/setup-node` 22 with npm
cache → `npm ci` → `npm run lint` → `npx prettier --check .` (after 6.2) → `npm run typecheck`
→ `npx prisma validate` → a migration-drift check (schema and migrations agree) →
`npm run test:unit` → Postgres 16 service → `npm run test:integration` → `npm run build` →
`npm audit --audit-level=high` (allow-list the Prisma CLI advisories until 5.1 removes it
from the runtime). Second job on `main` and tags: `docker build`, Trivy scan, push to GHCR
tagged with the version.
- **Branch protection on** `main`**:** require PR, require the CI check, no force push, no
deletion. Do not require reviews (single maintainer); do require the PR template.
- **Validation:** a PR with a failing unit test is blocked.
- **Correction, as built:** Prisma 7 removed `--to-schema-datamodel` and `--shadow-database-url`
  and takes the shadow database from the config file, so the drift check runs with a CI-only
  config at `scripts/ci/prisma.config.ci.ts`. Putting `SHADOW_DATABASE_URL` in the project's
  own `prisma.config.ts` would break every everyday `prisma` command on a machine that has
  no shadow database, because `env()` there resolves eagerly.



### 3.2 Tests for the audit's bugs

- **Severity:** P1
- **Files:** `tests/unit/grocery.test.ts`, `domain-misc.test.ts`, `yield.test.ts`,
`tests/integration/day-service.test.ts`, `backup.test.ts`
- **Scope:** S
- **Content:** the cases in 1.1, 1.3, 1.4, 1.5, 1.6, 1.7; mixed-state food; food id missing
from map; unknown unit; multiple inventory rows; MANUAL+MEASURED; `fridgeDays: 0`;
fractional portions per day; `bedtime === firstMealTime`.
- **Validation:** each test fails on the current tree and passes after the fix.



### 3.3 Inject the clock

- **Severity:** P3
- **Files:** `actions/water.ts:41`, `queries/reminders.ts:42`, integration tests using
`todayKey()`
- **Scope:** S
- **Validation:** integration suite passes with `vi.setSystemTime` at 23:59:58.



### 3.4 One more end-to-end journey

- **Severity:** P2
- **Files:** `tests/e2e/`
- **Scope:** S
- **Content:** offline behaviour (route abort → toast, page survives; server down → "showing a
copy from" banner) and a 320 px viewport pass over Shopping Mode asserting the counter is
readable.

---



## Phase 4 · Mobile and PWA



### 4.1 Honest offline state

- **Severity:** P1 (UI-3)
- **Files:** `public/sw.js`, `src/components/layout/offline-banner.tsx`, new
`src/components/pwa/stale-banner.tsx`
- **Scope:** M
- **Change:** on cache fallback the worker adds `X-PrepTracker-Cached-At` and posts
`{ type: 'served-from-cache', url, cachedAt }` to the client; the banner shows "Server
unreachable · showing Today as it was at 14:02" with a Retry button; the same banner when
`navigator.onLine` is false. Re-enable pull-to-refresh or provide Retry.
- **Validation:** Playwright with the server stopped after a load shows the banner with a
timestamp.



### 4.2 Service worker update and cache correctness

- **Severity:** P1 (UI-4, UI-5, UI-6)
- **Files:** `public/sw.js`, `next.config.ts`, `service-worker-registrar.tsx`
- **Scope:** M
- **Change:** inject the build id into the worker (`NEXT_PUBLIC_BUILD_ID` or a generated
`sw.js` at build) so cache names change per deploy; do not cache requests carrying the `RSC`
header or `_rsc` query (or cache them under a separate name never used for documents); check
`response.redirected` and skip; on `controllerchange` show "Update installed, reload" rather
than reloading mid-edit; cap `PAGE_CACHE` entries.
- **Validation:** deploy a new build while a tab is open; the tab prompts; after reload no
"Failed to find Server Action". `caches.keys()` shows one generation.



### 4.3 Layout fixes

- **Severity:** P1 / P2 (UI-7, UI-8, UI-9, UI-10, UI-11)
- **Files:** `today/page.tsx` (keys), `shopping-mode.tsx:111-136`, `sheet.tsx`,
`layout.tsx` (`interactiveWidget: 'resizes-content'`), `segmented-control.tsx`,
`meal-row.tsx:173`, `primitives.tsx:136`
- **Scope:** S
- **Change:** `key={date}` on date-scoped client components; Shopping header stacks the
control under the counter below 360 px; `safe-bottom` on `SheetContent` when no footer;
raise the remaining nine controls to 44 px.
- **Validation:** screenshots at 320 and 430 px; the 320 px Playwright assertion from 3.4.



### 4.4 Manifest and theme colour

- **Severity:** P2 / P3
- **Files:** `src/app/manifest.ts`, `src/app/layout.tsx`, `theme-toggle.tsx`
- **Scope:** S
- **Change:** `id`, `screenshots`, `display_override`, matching `theme_color`; update
`meta[name=theme-color]` when the theme is chosen manually; drop `orientation` lock.



### 4.5 Accessibility pass

- **Severity:** P2
- **Files:** `progress-strip.tsx`, all forms with `save.error`, `card.tsx`/`CardTitle` usage,
`meal-row.tsx`, `batch-card.tsx`, `prep-tasks.tsx`, `schedule-manager.tsx`, `globals.css:34`,
`analytics/page.tsx`, `charts.tsx`, `segmented-control.tsx`
- **Scope:** M
- **Change:** progress strip as a `section` with a separate details button; `aria-describedby`
  - `role="alert"` on error text via a shared `FieldError`; heading levels per page; labels for
  the two inputs and the two button groups; `--destructive` light to ≈ L 0.55; text summary
  under each chart; arrow-key handling in the two radiogroups.
- **Validation:** axe run in Playwright with zero serious violations on the five tabs.

---



## Phase 5 · Deployment and backup



### 5.1 Slim, versioned runtime image

- **Severity:** P2
- **Files:** `Dockerfile`, `docker-compose.yml`, `docker/entrypoint.sh`, `package.json`,
`prisma/seed.ts` (compile with `tsc` or `esbuild` at build)
- **Scope:** M
- **Change:** a `migrate` one-shot service (image with only Prisma CLI + migrations) that the
app `depends_on: condition: service_completed_successfully`; runtime image contains the
standalone output plus a compiled seed; `prisma` and `tsx` move to `devDependencies`. Tag
images `preptracker:vX.Y.Z` and `:sha-…`. Add `deploy.resources.limits`, `logging.options`
(`max-size: 10m`, `max-file: 5`), `cap_drop: [ALL]`.
- **Validation:** image under 400 MB; `npm audit` on the runtime tree has no high; upgrade
path from `v0.1.0` tested on a copy of the data; healthcheck green.



### 5.2 Security scanning

- **Severity:** P2
- **Files:** `.github/workflows/ci.yml`
- **Scope:** S
- **Change:** Trivy on the image; `npm audit` gate; Dependabot weekly for npm and Docker with
grouped minor/patch updates.



### 5.3 Reverse-proxy and Tailscale defaults

- **Severity:** P3
- **Files:** `docs/DEPLOYMENT.md`, `src/lib/auth/session.ts`
- **Change:** derive `secure` from `x-forwarded-proto` when `TRUST_PROXY=true` so
`COOKIE_SECURE` is not a manual step; document HSTS at the proxy; add `Permissions-Policy`.



### 5.4 Production-ready criteria for `v1.0.0`

Declare 1.0 when all of the following are true:

- Phases 0, 1, 3.1, 4.1, 4.2 and 5.1 complete.
- Deployed on the home server from a tagged image built by CI.
- Nightly backup with an off-host copy has run for 14 days and a restore test has passed.
- `docs/DISASTER_RECOVERY.md` has been exercised once.
- No open P0/P1 in the audit.

---



## Phase 6 · Polish and developer experience



### 6.1 Repository hygiene

- **Files:** new `LICENSE` (MIT or similar), `CHANGELOG.md`, `.nvmrc` (`22`), `.editorconfig`,
`SECURITY.md` (threat model in five lines), `.github/ISSUE_TEMPLATE/bug.md` and `feature.md`
- **Scope:** S



### 6.2 Formatting and pre-commit

- **Decision:** add **Prettier** (config with `printWidth 100`, `singleQuote`) and
`prettier --check` in CI; add **lint-staged + husky** running `eslint --fix` and `prettier --write` on staged files, because they cost nothing and remove a class of review noise.
**Do not add commitlint**: the history already follows the convention without it, and the
PR template and guide are enough for one maintainer. **Do not add** semantic-release or
changesets; a manual `npm version` per release is proportionate.
- **Scope:** S



### 6.3 Screenshot discipline

- Optimise PNGs (`pngquant --quality 60-80`) before committing; keep only the latest
"after" set; consider Git LFS if `docs/` exceeds 20 MB.
- **Scope:** S



### 6.4 Dependency policy

- Keep exact pins. Dependabot proposes; a human merges after CI. Majors (`lucide-react` 1.x,
`eslint` 10, `vitest` 5, `typescript` 7, `prisma` 8) each get their own PR and a read of the
changelog; none are urgent. Align `@types/node` with the runtime major (22).



### 6.5 Component splits

- The 15 components over 250 lines listed in the audit: extract sheets and forms into
siblings as each screen is next touched. Not a standalone project.

---



## Recommended lightweight SDLC


| Stage          | What it means here                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Requirement    | A GitHub issue (or a line in `docs/ASSUMPTIONS.md` when it is a decision) stating the user outcome.                                                                                 |
| Design         | For anything touching journal tables, the schema, backups or the service worker: a short section in `docs/ARCHITECTURE.md` or an ADR under `docs/adr/` before code. Otherwise none. |
| Implementation | `feature/<topic>` from `main`; commits per `docs/COMMIT_GUIDE.md`; domain logic with a unit test first.                                                                             |
| Review         | Self-review in the PR UI against the template checklist; CI green.                                                                                                                  |
| Testing        | `npm run verify` locally; CI runs the same plus build and audit; e2e before a release.                                                                                              |
| Merge          | Squash or rebase onto `main`; delete branch.                                                                                                                                        |
| Release        | `CHANGELOG.md` updated; `npm version`; annotated tag; CI builds and scans the image.                                                                                                |
| Deploy         | On the server: back up (automated gate), `git fetch && git checkout vX.Y.Z`, `docker compose pull && up -d`, check `/api/health` and the log lines.                                 |
| Monitor        | Healthcheck, nightly backup success, restore test success; the app's own error log (name/code only). No third-party telemetry.                                                      |
| Maintain       | Dependabot weekly; audit findings re-checked at each minor release.                                                                                                                 |




## Recommended Git workflow (summary)

Trunk-based: `main` + short-lived `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`,
`test/` branches; Conventional Commits; every change through a PR with the template and green
CI; squash- or rebase-merge; annotated semantic-version tags on `main`; branch protection
requiring the CI check and forbidding force-push and deletion. No `develop` branch and no
GitFlow: there is one deployment target and one maintainer, so a second integration branch
would only delay what `main` already is. Full detail in `docs/COMMIT_GUIDE.md`.