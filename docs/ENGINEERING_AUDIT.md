# PrepTracker engineering audit

Date: 2026-09-11. Branch audited: `feature/ux-redesign` at `97e5de3` (13 commits ahead of `main`).
Method: every tracked file was read; every automated check the project ships was run; the
running Docker stack was inspected; three parallel deep-dive reviews (domain and tests, server
layer, UI layer) were reconciled and their highest-impact claims re-verified by hand against
the source. Nothing in the application code was changed. Files created by this audit are
listed in section 17.

Companion: [REMEDIATION_PLAN.md](REMEDIATION_PLAN.md) turns the findings into phased work.

Severity: **P0** data loss, security compromise or unusable · **P1** major reliability,
security, integrity or maintainability issue · **P2** important improvement · **P3** polish.

---

## 1. Executive summary

PrepTracker is a well-designed application with a professional codebase and an unprofessional
delivery pipeline. The engineering in the code is better than most commercial projects of its
size: a pure, unit-tested domain core with an ESLint rule that keeps Prisma, Next and React out
of it; a journal-table schema that snapshots what was planned and eaten so plan edits cannot
rewrite history; server actions that validate with Zod, verify ownership through relation
filters and revalidate in one place; a Docker image that runs as non-root with a real
healthcheck; and documentation that a new engineer could actually onboard from.

What is missing is everything that turns a good codebase into a production system:

- **The code exists on one laptop.** The GitHub remote has no branches. `main` holds one
  43,000-line commit; the redesign is 13 commits on an unpushed feature branch. There is no CI,
  no tag, no release, no pull request has ever been opened. A disk failure loses the project.
- **The app's central promise is broken in one path.** "History is immutable" holds for plan
  edits, deletions, dosage changes and day-type deletion. It does not hold for *Rebuild this
  day*: the action deletes the day's meals and supplements (cascading away the "append-only"
  completion audit), re-portions meals that were already eaten from the current plan, and then
  reports "Completions were kept". It can be run on any past date.
- **Two bugs give users wrong numbers to act on.** The Prep screen's "start with X g raw"
  instruction is computed from the total purchase weight rather than the cooked target when a
  food appears in both cooked and raw states, and NaN quantities snapshot as 0 kcal instead of
  "unknown". Two places derive the calendar date from UTC and shift a day west of Greenwich.
- **Security is adequate for a tailnet, not for anything wider.** Backup restore inserts
  unvalidated rows with whatever `userId` the file carries; one action lets any ingredient's
  sort order be rewritten by id; there is no login throttling; sessions cannot be revoked and
  survive a password change; scrypt stores parameters it never applies; the example
  `AUTH_SECRET` passes validation.
- **Offline behaviour can mislead.** When the home server is down but the phone has signal,
  the service worker serves the last cached Today with no indication it is stale, and the
  first tap crashes the route because nothing catches a failed action and there is no error
  boundary.

**Verdict: not production-ready.** It is close, and the gap is mostly process and a short list
of targeted fixes rather than architecture. The remediation plan estimates the P0/P1 work at a
few focused days.

**Overall engineering maturity: 5.5 / 10.** Code 7, delivery 3.

---

## 2. Architecture assessment

### What it is

Next.js 16 App Router, React 19, TypeScript strict, Prisma 7 with the `pg` driver adapter,
PostgreSQL 16, Tailwind v4 with Radix primitives, Zod 4, Vitest and Playwright, a hand-written
service worker. Mutations are server actions; two HTTP routes exist for downloads and the
healthcheck. Single user by design, with `userId` on every owned table.

```
src/app/**            server components only; fetch on the server, pass plain props
src/components/**     54 client islands + presentational pieces
src/lib/actions/**    13 files: requireUserId → zod → (domain) → prisma → revalidatePath
src/lib/domain/**     14 pure modules, 3,213 lines, ESLint-enforced: no Prisma/Next/React
src/lib/queries/**    read models
src/lib/server/**     day-service (materialise), grocery-service, backup wrapper
src/lib/backup/**     client-agnostic export/restore used by app, CLI and tests
src/lib/auth/**       jose JWT cookie, scrypt, guards
```

### Is the architecture appropriate? Yes.

The functional-core / imperative-shell split is the right shape for an app whose value is a
set of calculations (grocery aggregation, yield, schedule, adherence). The purity rule is
mechanically enforced ([eslint.config.mjs:38-56](../eslint.config.mjs)) and the domain is
tested without a database in 216 ms. Server actions over REST is correct when each mutation
has exactly one caller. Snapshot-on-materialise is the right answer to "plans change, history
must not".

### Where it falls short

| Finding | Severity | Evidence |
| --- | --- | --- |
| The actions are the de facto service layer. Business rules live in actions rather than domain or server: grocery week naming and training/rest split ([actions/groceries.ts:83-98](../src/lib/actions/groceries.ts)), portion counts and task copy ([actions/prep.ts:108-141](../src/lib/actions/prep.ts)), yield roll-forward orchestration ([actions/prep.ts:227-256](../src/lib/actions/prep.ts)), day-type slug and quantity copy ([actions/settings.ts:175-223](../src/lib/actions/settings.ts)), inventory merge with unit conversion ([actions/groceries.ts:304-330](../src/lib/actions/groceries.ts)). | P2 | `src/lib/server` has two real modules; `src/lib/actions` has 3,731 lines. |
| `ensureDailyPlan` is a 290-line function with eight responsibilities (fast path, preload, lock, day-type, workout, timing, materialise, reconcile-by-delete-and-reinsert). The history bugs in section 5 are a direct result of the reconcile step being buried. | P2 | [day-service.ts:290-579](../src/lib/server/day-service.ts) |
| No persistence-aware layer owns invariants such as "a logged meal is immutable" or "a completion log is append-only". They are re-implemented, or forgotten, per call site. | P2 | `setDayType` defaults `keepLoggedMeals: true` ([day.ts:386](../src/lib/actions/day.ts)); `regenerateDay` omits it ([day.ts:402](../src/lib/actions/day.ts)). |
| Domain calculations re-implemented in components with different rounding: cooked→raw and yield preview in [batch-card.tsx:96,102](../src/components/prep/batch-card.tsx) (0/1 dp vs the domain's 2 dp), water percent in [water-card.tsx:83-85](../src/components/today/water-card.tsx), grocery progress in two pages, split-preset mapping in [workout-line.tsx:30-37](../src/components/today/workout-line.tsx). | P2 | Live preview and saved value disagree. |
| Three form-handling patterns coexist: `useActionState` (login, account), `useAction` + controlled state + `onClick` with `as unknown as` casts at 22 call sites, and raw `useTransition` + manual toasts (day-state, supplements, workout, shopping). | P2 | e.g. [meal-form.tsx:217](../src/components/plan/meal-form.tsx), [day-state-control.tsx:43-57](../src/components/today/day-state-control.tsx) |
| Double cache invalidation: every action calls `revalidatePath`, and 35 client call sites also call `router.refresh()`, so each tap renders the dynamic page twice. Today's components correctly rely on `revalidatePath` alone. | P1 | [shopping-mode.tsx:48-53](../src/components/groceries/shopping-mode.tsx) on supermarket signal. |
| Deprecated `middleware` file convention (Next 16 renamed it `proxy`); build warns. | P3 | Build output; [src/middleware.ts](../src/middleware.ts) |

### Domain model review

The concepts in the brief map one-to-one onto Prisma models and domain types, and the
terminology is consistent (Food, MealIngredient, FoodOptionGroup, DayType, DailyPlan,
DailyMeal, DailyMealItem, MealCompletion, Supplement, SupplementSchedule, WaterEntry,
GroceryWeek, GroceryItem, InventoryItem, PrepSession, PrepBatch, StoragePortion, CookingYield,
DailyCheckIn, Settings). The model is not anemic: the domain modules are pure functions over
plain records, a deliberate functional style, and it is the strongest part of the design.

Terminology drift: `rawQty` on a grocery line means "total to buy", not "raw equivalent of
the cooked amount" ([grocery.ts:348](../src/lib/domain/grocery.ts)), which is the root of the
Prep bug below; `Accumulator.baseUnit` holds a dimension; three verbs (`materialise`,
`generate`, `regenerate`) mean "compute from plan"; `MealPlan.archivedAt` is never set.

---

## 3. Repository assessment

| Area | Finding | Severity |
| --- | --- | --- |
| Layout | Feature-based and consistent: `components/{today,plan,prep,groceries,more,ui,layout}` mirror `actions/*` and the route tree. Tests mirror the layers. | done well |
| Large files | `seed.ts` 1,025; `day-service.ts` 655; `grocery.ts` 601; `actions/prep.ts` 571; `actions/plan.ts` 492; `actions/day.ts` 447; `workouts-manager.tsx` 430; 15 components over 250 lines with mixed responsibilities. | P2 |
| Functions over 80 lines | `generateMealTimes` 238 lines, `generateGroceryList` 173, `buildReminders` 141, `ensureDailyPlan` 290. | P2 |
| Duplication | `idSchema` declared 8×; per-file `revalidateX()` with overlapping lists (9 files, `/today` in 7); "find-or-fail" ~35× with two variants that throw instead; `z.preprocess('' → undefined)` hand-rolled ~15× although `common.ts` exports the helpers; nutrition object built 3×; active-plan `include` tree 3×; `trainingDays` reduction 3×; `Math.ceil(round(q/size,4))` 3× in one literal. | P2 |
| Dead code | `buildMeatRequirement` (yield.ts:158-198, only its test calls it), `toDbDateSafe`, `SUPPLEMENT_TIMING_LABEL_MAP`, `getDayTypeIsTraining`, `progress-ring.tsx` (imported nowhere), `MealPlan.archivedAt`, the `animate-in`/`slide-in-from-bottom` classes on sheets (no animation plugin installed, so sheets do not animate). | P3 |
| Binaries | 26 PNG screenshots, 8.3 MB, committed under `docs/audit-screenshots`; the largest is 493 KB. One more slice at this rate and the repository is dominated by images. | P3 |
| Hygiene | `.gitignore` and `.dockerignore` are correct: `.env`, backups, generated client, build output all excluded. Secret scan of the full history is clean. No `any`, no `@ts-ignore`, zero TODOs. | done well |
| Missing | `.github/` (no CI, no templates, no dependabot), `LICENSE`, `CHANGELOG.md`, `.editorconfig`, Prettier config, `.nvmrc`, `error.tsx`/`not-found.tsx`/`global-error.tsx`. | see sections 8, 13 |
| Tooling | ESLint 9 flat config with `eslint-config-next` and a purity rule; TypeScript strict with `noUncheckedIndexedAccess`; exact-pinned dependencies; `npm run verify` runs lint, typecheck, unit, integration. | done well |

---

## 4. SOLID and design-principle findings

| Principle | Violation | File / area | Severity | Correction |
| --- | --- | --- | --- | --- |
| SRP | `ensureDailyPlan` does resolution, timing, materialisation and reconciliation in one transaction body. | [day-service.ts:290-579](../src/lib/server/day-service.ts) | P2 | Split into `resolveDayContext`, `materialise`, `reconcileExisting`; make reconcile update-in-place. |
| SRP | `grocery.ts` carries types, constants, expansion, aggregation, inventory, packaging, grouping, supplements and cook requirements. | [grocery.ts](../src/lib/domain/grocery.ts) | P2 | Split into `grocery/aggregate.ts`, `inventory.ts`, `packages.ts`, `supplements.ts`, `types.ts`. |
| SRP | 15 components mix list, form, sheet and business rules (table in the UI review). | e.g. [workouts-manager.tsx](../src/components/plan/workouts-manager.tsx) 430 lines | P2 | Extract sheets and forms into siblings; keep managers as composition. |
| OCP | Enum-to-key casts repeated at eight boundaries (`as FoodCategoryKey`, `as IngredientStateKey`, `as SupplementTimingKey`). Adding a category means touching each. | day-service.ts:99,114,156; grocery-service.ts:80,110; queries/day.ts:124,182,265 | P3 | One boundary mapper module. |
| DIP | `backup/core.ts` takes a client as a parameter (good), but does so through `as unknown as Record<BackupTable, Delegate>`, which is exactly what lets restore compile without a schema. | [core.ts:118,163](../src/lib/backup/core.ts) | P2 | Type the delegate map with `Prisma.ModelName`; validate rows with Zod per table. |
| ISP | `YieldValidation` / workout validation return `{ ok: false, message?: string }`, forcing `message!` at six call sites. | [workout.ts:69-73,346-349](../src/lib/actions/workout.ts), prep.ts:437 | P3 | Discriminated union. |
| DRY | See duplication table in section 3, plus the overdue-meal predicate defined twice with different windows (12 h/15 min vs 6 h/0 min). | schedule.ts:456-467 vs reminders.ts:82-84 | P2 | One predicate in `domain/time.ts`. |
| KISS | Three optimistic-update strategies (`useOptimistic`, hand-rolled state + render-time resync, none). | supplement-groups.tsx:40, water-card.tsx:36-47, next-meal-hero.tsx:98 | P2 | Standardise on `useOptimistic` via a small hook. |
| Explicit over implicit | `setDayType` with a different day type silently triggers a full regeneration through `ensureDailyPlan`'s `dayTypeId` mismatch path. | [day-service.ts:341-342](../src/lib/server/day-service.ts) | P2 | Make regeneration an explicit function; `setDayType` calls it. |
| Testability | Three domain functions read the real clock through default arguments and two callers omit the argument (`isProbableDuplicate` from `actions/water.ts:41`, `currentTimeString` from `queries/reminders.ts:42`). | water.ts:69, time.ts:89 | P3 | Pass `now` from the action. |
| YAGNI | `MealPlan.archivedAt`, `Food.externalSource/externalId`, `AppSetting` table, `PrepTaskKind.SHOP/CLEAN` are unused. Harmless but documented as reserved; keep the list short. | schema.prisma | P3 | Note in ARCHITECTURE; remove `archivedAt` or use it. |

Composition over inheritance: no class hierarchies exist; components compose. Coupling is low
between domain and everything else and high between actions and Prisma (expected).

---

## 5. Data integrity and history

The design goal is stated in three places and mostly delivered: journal rows carry their own
copy of names, quantities, units and macros; every journal→definition FK is nullable
`SetNull`. Integration tests prove that renaming or re-measuring a food, editing nutrition, and
deleting a food after a day exists do not change the day
([day-service.test.ts:98-123,176-193](../tests/integration/day-service.test.ts),
[foods.test.ts:177-220](../tests/integration/foods.test.ts)), and an end-to-end test proves it
through the UI ([workflow.spec.ts:186-204](../tests/e2e/workflow.spec.ts)).

Trace of each scenario in the brief:

| Event | Effect on history | Verdict |
| --- | --- | --- |
| Edit today's plan | Definition tables only; stored days untouched until an explicit rebuild. | safe |
| Delete a food | `DailyMealItem.foodId` SetNull, name/quantity/macros retained. **But** `MealIngredient.foodId` is `onDelete: Cascade` ([schema.prisma:537](../prisma/schema.prisma)), so the plan definition silently loses lines and their quantities; a substitution group can drop below two members. The toast reports the count after the fact ([foods.ts:201-209](../src/lib/actions/foods.ts)). | history safe; plan integrity P2 |
| Change ingredient quantity | Definition only. | safe |
| Change supplement dosage | `DailySupplement` keeps its own dosage snapshot. | safe |
| Delete a day type | `DailyPlan.dayTypeId` SetNull, name/isTraining retained. `ScheduleDay` cascades, so the weekly pattern silently loses that weekday. | history safe; P3 |
| Change water target | Settings only, unless `applyToToday && date`: then `dailyPlan.updateMany` for **any** date the client sends, contradicting the docstring above it. Historical water adherence moves. | **P2** ([water.ts:130-135](../src/lib/actions/water.ts)) |
| Regenerate grocery list | Each `GroceryItem` snapshots required, shopping, yield used, inventory subtracted, package size. The list is a reproducible record; the *inputs* (per-day-type counts, include flags, option preferences) are not stored, so the generation is not. | P3 |
| **Rebuild this day** | `ensureDailyPlan({ regenerate: true })` deletes every `DailyMeal` and `DailySupplement` for the date ([day-service.ts:446-447](../src/lib/server/day-service.ts)). That cascades to `meal_completions` and `supplement_completions`, the tables the schema itself calls "append-only audit … so undo history survives" ([schema.prisma:757](../prisma/schema.prisma)). Meals are re-created from the *current* plan; `frozenItems` is only built when `keepLoggedMeals` is passed ([:489-490](../src/lib/server/day-service.ts)), and `regenerateDay` does not pass it ([day.ts:402](../src/lib/actions/day.ts)). A COMPLETED meal therefore gets today's quantities, foods and macros, losing substitutions and quantity overrides, while keeping its status, and the user is told "Completions were kept." A logged meal that the new day type excludes vanishes with its audit rows. The action accepts any past date. | **P1** |
| Set day type after eating | Same code path with `keepLoggedMeals: true`, so eaten plates are frozen. Logged meals excluded by the new type still vanish. | P1 (same fix) |
| Retime day (workout change) | Only PENDING meals move, but reachable for past dates. | P3 |
| Restore backup | One transaction; rollback on any failure (tested). No validation of rows: see section 6. | P1 |

**Conclusion.** Immutable snapshots are the right mechanism and are in place. What is missing
is an invariant layer: "never delete a non-PENDING journal row, never cascade-delete audit
rows, never regenerate a date before today without an explicit force". Implement rebuild as
update-in-place keyed by `sourceMealId`, default `keepLoggedMeals` to true, and either drop
the `Cascade` from `MealCompletion`/`SupplementCompletion` to `Restrict` or stop deleting
their parents.

---

## 6. Database findings

35 models, 5 migrations, all applied automatically at container start. Migrations are
version-controlled, deterministic, additive (four `ADD COLUMN` with defaults, three new
tables), and `prisma validate` passes. No down migrations exist (Prisma convention); rollback
is "restore the dump", which the docs say.

| Finding | Severity | Location |
| --- | --- | --- |
| No indexes on foreign-key columns that are queried or cascaded: `mealIngredient.foodId`, `mealIngredient.optionGroupId`, `dailyMealItem.foodId`, `dailyMeal.sourceMealId`, `dailySupplement.supplementId`, `waterEntry.dailyPlanId`, `supplementSchedule.mealId`, `cookingYield.prepBatchId`, `storagePortion.prepBatchId`, `storagePortion.foodId`, `inventoryItem.foodId`, `dailyWorkoutFocus.focusId`. Every `SetNull`/`Cascade` from `Food` scans the child table. Postgres does not auto-index FKs; Prisma does not add them. At single-user volumes this is invisible; it is still wrong. | P2 | schema.prisma |
| `MealIngredient.foodId` cascades: deleting a food deletes plan lines. Should be `Restrict` with a guided "remove from N meals first" flow, or at least a pre-delete confirmation that names the meals. | P2 | schema.prisma:537 |
| Redundant `@@index([userId, date])` beside `@@unique([userId, date])` on `DailyPlan`. | P3 | schema.prisma:656-657 |
| No partial unique index enforcing one active `MealPlan` per user; `saveMealPlan` uses count-then-create. | P3 | schema.prisma:485; plan.ts:71-78 |
| `HH:mm` times stored as `String` with no CHECK; validation is application-side only. Acceptable given Zod at every entry, but a raw restore can insert garbage that later throws in `timeToMinutes`. | P3 | schema.prisma |
| Timestamps: every mutable table has `createdAt`/`updatedAt`; journal tables have `generatedAt`/`completedAt`/`at`. No `deletedAt` anywhere; soft deletion is not needed because history is snapshotted. Correct call. | done well | |
| Cascade audit: 39 Cascade, 18 SetNull. All journal→definition edges are SetNull. Definition→definition cascades are intentional (plan→meal→ingredient→quantity). The two harmful ones are `MealCompletion`/`SupplementCompletion`→parent (audit destroyed on rebuild) and `Food`→`MealIngredient`. | P1 / P2 | |
| N+1: `getWeeklyAdherence` runs `getDayRows` once per week in a loop; `ensureDailyPlan` creates each meal and dose in its own statement; `addPurchasesToInventory` runs 2–3 queries per item; `getDayView` calls `ensureDailyPlan` then re-fetches. | P3 | analytics.ts:170-174; day-service.ts:484-571; groceries.ts:304-330 |
| Unbounded `findMany`: `getYieldHistory`, food maps loaded per materialisation. Fine at this scale. | P3 | |
| Deterministic collation (`--locale=C`) set in compose. | done well | docker-compose.yml |

---

## 7. Security findings

Context: single user, self-hosted, bound to loopback by default, documented for LAN, Tailscale
or a Caddy reverse proxy. Graded as "safe to expose on a tailnet or behind a reverse proxy",
and also against the schema's stated multi-user readiness.

| ID | Finding | Severity | Evidence |
| --- | --- | --- | --- |
| SEC-1 | **Backup restore inserts unvalidated rows.** `JSON.parse(json) as BackupFile`, two shape checks, then `createMany` per table with whatever `userId`/FK values the file carries. Under multi-user this is cross-tenant write; today it is insecure deserialisation that can plant rows with foreign ids, set an arbitrary `passwordHash`, and produce Prisma validation errors whose message (containing the submitted data) is returned to the browser and logged. `version` is not checked to be a number. | P1 | [core.ts:150-178](../src/lib/backup/core.ts), [data.ts:33-42](../src/lib/actions/data.ts) |
| SEC-2 | **IDOR in `reorderIngredients`.** Meal ownership is asserted, but the `ids` array is never checked against the meal; each id is updated by primary key. | P1 | [plan.ts:413-416](../src/lib/actions/plan.ts) (contrast `reorderMeals` :299) |
| SEC-3 | `createPrepSession` stores an unverified `groceryWeekId`; `addStoragePortion` an unverified `foodId`. | P2 / P3 | prep.ts:100, :554 |
| SEC-4 | Sessions: 30-day HS256 JWT, no `jti`, no revocation list, no session version. Password change does not invalidate existing tokens; sign-out only deletes the cookie. Only deleting the user revokes. | P2 | session.ts:14,37-45; auth.ts:72-75 |
| SEC-5 | scrypt: `PARAMS` (N=16384) is below the OWASP minimum (N=2^17), and neither `hashPassword` nor `verifyPassword` passes the parameters to `scrypt`; the `$N$r$p$` segments are written but never read. Raising `PARAMS` today would change the string and not the computation. | P2 | [password.ts:20-29,39-45](../src/lib/auth/password.ts) |
| SEC-6 | No login rate limiting or lockout. Constant-time compare and dummy-hash on unknown user are correct; scrypt cost is the only brake. | P2 | auth.ts:17-37 |
| SEC-7 | Open-redirect guard accepts `/\evil.com`; browsers normalise `\` to `/`. Also does not reject `/login?next=…` loops. | P2 | auth.ts:34 |
| SEC-8 | The example `AUTH_SECRET` (51 chars) passes the length check; an unedited `.env.example` copy signs sessions with a public key. Compose enforces presence, not quality. | P2 | .env.example; session.ts:28 |
| SEC-9 | `runAction` returns any thrown `Error.message` to the client, including Prisma error text (constraint names, table names, validation args). | P2 | result.ts:72-74 |
| SEC-10 | `mustChangePassword` is UI-only; nothing blocks use while true. | P3 | guards.ts:27; more/page.tsx:56 |
| SEC-11 | No CSP, no HSTS, no Permissions-Policy from the app. HSTS is delegated to the proxy (documented). CSP would need `'unsafe-inline'` for Next; a nonce-based policy is possible but not required for this threat model. | P3 | next.config.ts |
| SEC-12 | CSV export does not neutralise leading `=`, `+`, `-`, `@` (formula injection). Self-inflicted in a single-user app. | P3 | core.ts:201-221 |
| SEC-13 | `experimental.serverActions.bodySizeLimit: '25mb'` applies to every action, not just restore. | P3 | next.config.ts |
| SEC-14 | `scripts/dev/mint-session.mts` mints a session for the first user with no production guard. Not copied into the image. | P3 | |
| SEC-15 | Docker: non-root uid 1001, tini, healthcheck, DB not published, loopback bind, `poweredByHeader: false`, `sw.js` no-store. No `read_only`, `cap_drop`, resource limits or log rotation. | P3 | Dockerfile, compose |

Not found: SQL injection (all Prisma; the one `$executeRaw` is a tagged template with a
parameter), command injection, XSS sinks (no `dangerouslySetInnerHTML`), committed secrets,
third-party telemetry, outbound network calls. CSRF posture is adequate (POST-only actions
with Next's origin check, `SameSite=Lax`, GET-only export).

**Is it safe to expose through Tailscale or a reverse proxy?** Yes for Tailscale (an
authenticated private network, one user, HTTPS). For a reverse proxy on a LAN, yes after
SEC-6 and SEC-8. For anything reachable from the public internet: no, and the docs already say
so.

### Dependency audit

`npm audit`: 4 high, 1 low. All four high are transitive through the `prisma` CLI package
(`mysql2` ×2, `deepmerge-ts` via `@prisma/config`) and unreachable at runtime for a Postgres
app, but `prisma` and `tsx` are in `dependencies` rather than `devDependencies` because the
container migrates and seeds at boot, so the vulnerable tree ships in the image. `esbuild`
(low) is dev-only. `npm outdated`: Radix packages one to eight patch versions behind;
`lucide-react` 0.552 → 1.45, `eslint` 9 → 10, `vitest` 4 → 5, `typescript` 5.9 → 7.0 are
majors and should not be taken blindly; `@types/node` is 24.x while the image runs Node 22.
Every dependency is justified and used; nothing duplicates another. `recharts` is the only
heavy client dependency and is route-split to `/more/analytics`.

---

## 8. Git findings

| Finding | Severity |
| --- | --- |
| **Nothing has been pushed.** `git ls-remote --heads origin` returns no refs. Both branches have no upstream. The project's only copy is this working tree. | **P0** (loss of the project) |
| `main` is a single 192-file, 42,991-line commit. It cannot be reviewed, bisected or partially reverted. It is honest about this in its own message. | P2 (historical; fix going forward) |
| One long-lived feature branch with 13 commits, three of which exceed 1,500 changed lines (`8bbf368`: 22 files, 1,807+/1,545−). Not atomic in the small sense; logically grouped per slice. | P2 |
| No tags, no releases, no CHANGELOG; `package.json` says `1.0.0`. | P2 |
| No pull requests have ever existed; no branch protection can exist on an empty remote. | P2 |
| Commit messages: every one is Conventional-Commits formatted with a scope and a body that states the problem, the change and the reasoning. No `fix`/`wip`/`stuff` commits. All 14 carry `Co-Authored-By: Claude`. | done well |
| No force pushes, rebases or amends in the reflog; history is linear. | done well |
| No committed secrets, `.env` files, build artifacts or generated code (full-history scan). | done well |
| 8.3 MB of PNGs across two docs commits. | P3 |

**Are commits atomic, descriptive, logically grouped, reversible, easy to review?**
Descriptive and logically grouped: yes. Atomic and easy to review: no, they are slice-sized.
Reversible: each is revertable as a unit but a revert of `8bbf368` would remove 22 files.

---

## 9. CI/CD findings

There is no CI. No `.github/workflows`, no other provider. `npm run verify` exists and
passes, but only when someone remembers to run it. Docker images are built by `docker compose
up --build` on the server from whatever the working tree contains; no image is tagged with a
version or commit.

What was verified by hand in this audit (all green):

| Check | Result |
| --- | --- |
| `eslint .` | 0 errors, 0 warnings |
| `tsc --noEmit` | clean |
| `prisma validate` | valid |
| `next build` | success; 1 deprecation warning (`middleware` → `proxy`) |
| `vitest --project unit` | 8 files, 240 tests, 216 ms |
| `vitest --project integration` (real Postgres, own database) | 7 files, 124 tests |
| `playwright test` (production standalone build, Pixel 7 viewport, own database) | 2 passed, 1 skipped (visual capture, gated by `VISUAL=1` by design) |
| Docker image (built 30 min before audit, running) | healthy, non-root, 1.31 GB |

A minimal pipeline is specified in the remediation plan (Phase 3). Security scanning: `npm
audit` in CI with a threshold, and Trivy on the built image, are both cheap and worthwhile.

---

## 10. Testing findings

366 automated tests in three layers, all passing, none skipped except the deliberate visual
capture. Assertions are concrete values; no tautologies found. Worked examples in doc comments,
test constants and seed data agree (2,450 g cooked → 3,266.7 g raw → "3.27 kg" appears in
`yield.ts`, `yield.test.ts` and `workflow.spec.ts`).

Critical logic coverage:

| Calculation | Single source | Tested | Gaps |
| --- | --- | --- | --- |
| Grocery aggregation | `generateGroceryList` | yes, 509-line suite | mixed COOKED+RAW same food (the P1 bug), food id missing from map, unknown unit, cross-dimension mix, multiple inventory rows per food, `supplementGroceryLines` (integration only) |
| Training/rest quantities | `quantityByDayType[id] ?? 0` | yes, unit + integration | none |
| Cooked→raw | `cookedToRaw` | yes | re-implemented in `batch-card.tsx` untested |
| Yield measurement / rolling mean | `measureYield`, `effectiveYield` | yes | MANUAL + MEASURED mix (behaves unexpectedly, see F9 below); History page average uses a different rule |
| Water | `waterProgress`, `validateWaterAmount` | yes | non-finite entries; zero target semantics differ between modules |
| Meal / supplement / weekly adherence | `adherence.ts` | yes | item-weighted overall vs day-weighted split asymmetry; band boundaries |
| Inventory subtraction | `applyInventory` | yes | multiple rows per food; supplement lines never netted |
| Schedule generation | `generateMealTimes` | yes, property-style sweep across 7 workout times | bedtime == first meal; pin inside bedtime margin |
| Materialisation | `materialiseDay` | yes | NaN quantity (the P1 bug); `includeZeroQuantities` |
| Storage / thaw | `storage.ts` | yes | `fridgeDays: 0` (thaw date before prep date); fractional portions per day |
| Historical snapshot behaviour | `day-service.test.ts`, `foods.test.ts`, e2e | **yes** | rebuild with a completed meal and `keepLoggedMeals` omitted (the P1 bug); audit rows surviving rebuild |
| Backup round-trip, cross-user isolation, rollback | `backup.test.ts` | yes | malformed rows, foreign `userId` |

Domain bugs found by reasoning and confirmed by executing the functions:

| ID | Finding | Severity | Location |
| --- | --- | --- | --- |
| F1 | `rawQty` on a grocery line is total purchase weight (cooked-converted + raw + as-is), not the raw equivalent of `cookedQty`. `cookingRequirements` inherits it and `createPrepSession` writes "Start with about 333 g raw at 75%" for a batch whose cooked target is 175 g when the same food also appears in a RAW ingredient. | **P1** | grocery.ts:328,348,597; prep.ts:123-129 |
| F2 | `macrosForQuantity` returns `0` kcal, not `null`, for NaN/Infinity quantity or NaN basis, violating its own header comment; the zero is snapshotted into `DailyMealItem`. | **P1** | nutrition.ts:77-79; units.ts:110 |
| F3 | Two UTC date slices: `refrigerateOn` when moving a portion to the fridge, and yield-history point dates. West of Greenwich after ~16:00 local these are tomorrow. | **P1** | prep.ts:510; analytics.ts:261 |
| F4 | Water "behind pace" reminder uses a hard-coded 08:00–22:00 window rather than the user's first meal time. | P2 | reminders.ts:325-330 |
| F5 | Two definitions of "overdue meal" (12 h/15 min vs 6 h/0 min); a meal 7.5 h late is overdue on Today but absent from reminders. | P2 | schedule.ts:456-467; reminders.ts:82-84 |
| F6 | `weekStats.overallPercent` is item-weighted while training/rest percents are day-weighted; Overall 90.9 % can sit beside Training 100 % / Rest 0 %. | P2 | adherence.ts:155-179 |
| F8/F9 | `effectiveYield` includes MANUAL rows in the rolling mean (manual 82 then measured 70 → 76); History page average uses all MEASURED points at 1 dp. Two numbers for "the yield". | P2 | yield.ts:146; analytics.ts:271-277 |
| F10 | Supplement grocery lines bypass inventory subtraction; the seed's Creatine inventory row is never netted. | P2 | grocery.ts:744; grocery-service.ts:165 |
| F11 | Period stats count *today* as countable, so every meal later today is "missed" at 09:00; a test locks this in. | P2 | analytics.ts:125-127; analytics.test.ts:60-75 |
| F14–F21 | `totalDays` not floored; `fridgeDays: 0` thaw before prep; `'softgel'` used as a unit; `round` asymmetric for negatives; three "percent when target is 0" semantics; dead branch; doc/code mismatch in `eatFirstOrder`. | P3 | as cited |

Flakiness: integration tests derive `today` from the real clock; a midnight crossing mid-run
would fail them. Low probability; inject a clock.

Balance: the pyramid is right (240 unit / 124 integration / 2 e2e). The e2e journey is long
and brittle by nature but it is one test, runs in 20 s on the production build, and catches
integration regressions. Keep it at one or two journeys.

---

## 11. Mobile and PWA findings

The redesign delivered what it claims for the primary screen: at 430 px, "Mark eaten" and both
water buttons are above the fold; Today is 1,882 px tall instead of 3,461; no horizontal
overflow at 320 px or at 160 % text; all `Button` sizes are ≥ 44 px; numeric fields use
`inputMode="decimal"`; native pickers for time and date; no `confirm()`/`alert()`; safe-area
insets on header, nav, banner and shopping bar; pinch zoom preserved.

| ID | Finding | Severity | Location |
| --- | --- | --- | --- |
| UI-1 | **Failed action → route crash.** `useAction` awaits the server action inside `startTransition` with no `try/catch`; a rejected fetch (server down, connection drops mid-tap, PWA opened on a cached page) is thrown to the nearest error boundary, and there is none anywhere, so the route unmounts into Next's "Application error" screen. Same in four hand-rolled `useTransition` sites. The offline copy promises "changes will not save"; the behaviour is a crash. Confirmed by code reading; not reproduced on a device. | **P1** | use-action.ts:34-53; day-state-control.tsx:53; supplement-groups.tsx:55; workout-line.tsx:111; shopping-mode.tsx:48 |
| UI-2 | No `error.tsx`, `not-found.tsx` or `global-error.tsx`. Four pages call `notFound()` and get Next's unstyled 404 with no nav. | P1 | src/app |
| UI-3 | **Stale Today with no indication when the server is down but the phone is online.** The banner keys on `navigator.onLine`; the service worker silently serves the last cached copy on fetch failure. No "cached at" anywhere. This is the exact stale-data risk the brief names. | **P1** | offline-banner.tsx:24-28; sw.js:109-121 |
| UI-4 | Service worker update strategy: `skipWaiting` on install, `clients.claim` on activate, plus a `SKIP_WAITING` post on `updatefound`, with no `controllerchange` reload and no "update available" prompt. An open page keeps its old server-action ids; the next tap fails with "Failed to find Server Action" (the project's own troubleshooting entry). `VERSION = 'v1'` never changes, so the activate purge never runs and caches grow forever. | P1 | sw.js:17,38,52; service-worker-registrar.tsx:36-46 |
| UI-5 | `cache.match(url.pathname, { ignoreSearch: true })` can return a cached RSC flight payload (`/today?_rsc=…`) for a document navigation. **Correction:** this report originally said Next 16 no longer sends `Vary: RSC`. That is wrong for 16.3.4 — `setVaryHeader` in `base-server.js` still appends it for app paths. The finding stands for two other reasons: `_rsc` is a hash of the router state, so an entry is never hit twice, and a payload names the chunks of the build that produced it, so a stale one is worse than no answer. | P1 | sw.js:121 |
| UI-6 | RSC fetch after session expiry follows the redirect to `/login` and the 200 is cached under `/today?_rsc=…`; the `response.redirected` flag is never checked despite the comment. | P2 | sw.js:111-114 |
| UI-7 | `NoteRow` initialises state from props once and is not keyed by date; Prev/Next chevrons are soft navigations, so Thursday's sheet shows Friday's note. | P1 | note-row.tsx:71-83; today/page.tsx:94-103 |
| UI-8 | Shopping Mode header at 320 px: 272 px of fixed-width controls in a 288 px box crushes the live counter into a 16 px column ("12 / items / remai…"). Screenshot `after2-shopping-320.png` shows it; the log's "no horizontal overflow" claim is technically true. | P1 | shopping-mode.tsx:111-136 |
| UI-9 | Sheets without a `SheetFooter` have no home-indicator inset; the Cancel button of every destructive confirmation sits under the iOS home bar in standalone mode. | P1 | sheet.tsx:64,75; confirm-sheet.tsx:41-57 |
| UI-10 | Sheet footers sit behind the iOS keyboard while typing (no `interactiveWidget`). | P2 | sheet.tsx:36; layout.tsx:30-40 |
| UI-11 | Sub-44 px targets remain in nine places: `SegmentedControl size="sm"` (36 px, used in Shopping Mode's Remaining/All), the "Eaten 12:42" chip (36 px, the redesign's primary time-correction control), `TabsTrigger` (36 px), sheet close (40 px), colour swatches, focus chips, "tap to change" text links. | P2 | segmented-control.tsx:45; meal-row.tsx:173; primitives.tsx:136 |
| UI-12 | `theme_color` in the manifest (`#3a5cd6`) disagrees with the viewport theme colours; `meta theme-color` does not follow a manual dark/light choice; manifest lacks `id` and `screenshots`; `orientation: portrait` locks tablets. | P2 / P3 | manifest.ts; layout.tsx:36-39 |
| UI-13 | `saveAmounts` fires one action per changed item in an un-awaited loop and closes the sheet first. Settings water group runs two actions and flashes "Saved" when the first succeeds. `DeleteButton` closes the sheet before running, so deletes show no pending state. | P2 | meal-row.tsx:126-136; settings-manager.tsx:166-169; delete-button.tsx:63-66 |
| UI-14 | `overscroll-behavior-y: none` disables pull-to-refresh in standalone mode; with UI-3 the user has no way to force a fresh load. | P3 | globals.css:172 |
| UI-15 | `history-tabs.tsx` (310 lines) and `plan-meal-list.tsx` are client components for one Radix Tabs / one segmented control; the lists could be server-rendered. `recharts` is statically imported in the analytics route (route-split, not deferred). | P3 | |

Offline writes are deliberately not queued (documented in IMPLEMENTATION_LOG). That decision
is correct for a single-user app; the missing piece is honest failure, not a queue.

---

## 12. Accessibility findings

Foundations are good: Radix dialogs always carry a title and description; every icon-only
button has an `aria-label` (13 checked); `header`/`main`/`nav aria-label="Primary"` with
`aria-current`; skeletons are `aria-busy`; `aria-expanded`/`aria-pressed` used on disclosures
and chips; `fieldset`/`legend` for grouped inputs; global `:focus-visible`; `lang="en"`;
sonner's toaster is a live region; `prefers-reduced-motion` honoured.

| ID | Finding | Severity | Location |
| --- | --- | --- | --- |
| A11Y-1 | `ProgressStrip` is a `<button aria-label="Today's progress. Show details">` wrapping the three stats; the label replaces the content, so a screen reader never hears the numbers. Block content inside a button is also invalid. | P2 | progress-strip.tsx:37-41 |
| A11Y-2 | No `aria-describedby` anywhere. `aria-invalid` is set on 8 inputs but the error text beneath is not associated; 19 inline `save.error` paragraphs have no `role="alert"`, so a failed save inside a sheet is silent. Only login and account use `role="alert"`. | P2 | meal-form.tsx:90,200; ingredient-form.tsx:256 |
| A11Y-3 | Heading order skips on six pages (h1 → h3 via `CardTitle`); `<h3>` inside `<button>` in meal rows and batch cards; `/more/history` has no headings; meal name repeated as h1 and h2. | P2 | card.tsx:18; meal-row.tsx:140; batch-card.tsx:127 |
| A11Y-4 | Unlabelled inputs: meal note textarea (placeholder only), prep "Add a task" input; two Radix `Label`s with no `htmlFor` wrapping button groups; colour swatches named by hex with no selected state. | P2 | meal-row.tsx:306; prep-tasks.tsx:75; schedule-manager.tsx:79-92 |
| A11Y-5 | `--destructive: oklch(0.58 0.21 27)` in light mode computes to ≈ 4.3:1 on white, used as normal-size text for every inline error and the delete label. Every other token pair checked passes AA in both themes. | P2 | globals.css:34 |
| A11Y-6 | Colour alone conveys meaning in analytics charts ("Overall in blue, meals in green"); adherence bands by fill only. | P2 | analytics/page.tsx:120,133; charts.tsx:124-173 |
| A11Y-7 | `role="radiogroup"` on `SegmentedControl` and `ThemeToggle` with every radio as a tab stop and no arrow-key handling. | P3 | segmented-control.tsx:40-58 |
| A11Y-8 | `aria-labelledby` on a plain `div` (`Card`) is ignored. `<details>` with `list-none` and no replacement chevron in six places. Optimistic water/supplement changes not announced. Focus ring clipped by `overflow-hidden` cards. `text-[10px]` in one badge. | P3 | next-meal-hero.tsx:37; workout-line.tsx:220 |

---

## 13. Deployment findings

Runtime facts from the live stack: `preptracker-app` healthy, `User=preptracker` (uid 1001),
`restart=unless-stopped`, published only on `127.0.0.1:3000`; `preptracker-db` has no
published port and a named volume; `./backups` bind-mounted into both; `tzdata` works (the
container reports PDT). `/api/health` returns `{"status":"ok","database":"up"}`.

| Finding | Severity |
| --- | --- |
| Image is **1.31 GB** with a 768 MB `node_modules`, because the runtime keeps a full production `node_modules` (Prisma CLI, `tsx`, Next) to migrate and seed at boot. `docs/DEPLOYMENT.md` says "~350 MB image". The documentation is wrong by 4×. | P2 |
| Migrations run automatically on every container start with no backup gate; the "back up first" step is manual and documented. A one-shot `migrate` compose service, or an entrypoint that refuses to migrate unless a fresh dump exists, would make the documented procedure the enforced one. | P2 |
| The seed runs TypeScript through `tsx` in production; the emptiness probe swallows DB errors (`catch → '0'`) and then attempts to seed, which fails loudly. Acceptable, but a compiled JS seed and a proper probe are cleaner. | P3 |
| No image versioning: `preptracker:latest` from whatever the working tree holds. Combined with no tags, the running version is untraceable. | P2 |
| Compose has no CPU/memory limits, no `logging` driver options (Docker json-file grows unbounded), no `read_only`/`cap_drop`. | P3 |
| Multi-stage build, non-root, `tini`, healthcheck via loopback fetch, `postgresql16-client` for in-container dumps, deterministic collation, distinct compose project names so `down` on one cannot remove the other, placeholders confined to the builder stage. | done well |
| Home-lab architecture (phone → Tailscale → host → app → Postgres on the compose network) is sound. Tailscale `serve` with `COOKIE_SECURE=true` is the right default recommendation; LAN-only is fine with SEC-6/SEC-8 fixed; public exposure is correctly refused. Postgres is never published. | done well |

---

## 14. Backup and recovery findings

Mechanisms exist at three levels and the JSON round-trip is proven by an integration test
that also verifies cross-user isolation and transactional rollback
([backup.test.ts](../tests/integration/backup.test.ts)). The restore CLI demands a typed
`REPLACE`. A restore into a scratch database is documented as a manual test. That is more than
most self-hosted projects have. It is still not a backup *system*.

| Finding | Severity |
| --- | --- |
| **Nothing is automated.** The nightly `pg_dump` cron is a documentation snippet, not part of the deployment. The `backups/` directory on this machine holds one hand-made dump and one JSON export from the same day. | **P1** |
| **No secondary copy.** Backups live on the same host and disk as the database. A host failure loses both. | **P1** |
| **The application source has no remote copy** (section 8). A restore requires the code to restore into. | **P0** |
| Backups are unencrypted and include `users.passwordHash` plus every diet, supplement and check-in record. They are bind-mounted into two containers. The export UI does not say the file is a credential. | P2 |
| Restore does not validate the file (SEC-1); a corrupted or hand-edited backup fails with an opaque Prisma error after deleting the user inside the transaction (which rolls back, so no data loss, but no diagnosis either). | P1 |
| The backup format has `version: 1` but no schema hash or app version. Backups written before a column addition restore correctly (defaults); a future column rename or removal will break old backups with no migration path. | P2 |
| Restore of a backup with a different user id deletes the current user and clears the session by design; documented. | done well |
| Restore is not verified by automation against the *current* schema after each migration. Add "restore last night's dump into a scratch DB" to CI or a weekly job. | P2 |

**Can the database be backed up and restored?** Yes, by hand, and the restore path has an
automated test. **Can user data be exported?** Yes: full JSON and seven CSV extracts, all
scoped to the user. **Does a backup system exist?** No.

---

## 15. Documentation findings

README (625 lines), ARCHITECTURE, ASSUMPTIONS (20 numbered ambiguities with the decision and
where to change it), DEPLOYMENT (first run, Tailscale, Caddy, NPM, timezone, backups,
troubleshooting), UX_AUDIT, UI_DESIGN_SPEC and IMPLEMENTATION_LOG. A new engineer can learn
what it does, the architecture, setup, database, commands, tests, deployment, backup, restore
and updates from these. This is the project's strongest non-code asset.

| Gap | Severity |
| --- | --- |
| No Git workflow, branch naming, commit convention or PR process was documented. (`docs/COMMIT_GUIDE.md` and `.github/pull_request_template.md` were created by this audit.) | P2 |
| No CHANGELOG, no release process, no versioning policy. | P2 |
| No disaster-recovery runbook: what to back up to restore completely, and step-by-step recovery for host loss, corrupt volume, failed migration, lost phone. (Section 16 and the remediation plan supply one.) | P2 |
| Wrong figures: DEPLOYMENT says ~350 MB image (actual 1.31 GB); ARCHITECTURE says 30 tables, README says 32, the schema has 35 models. | P3 |
| No `LICENSE` file ("Personal project. Use it however you like." is not a licence). | P3 |
| No `SECURITY.md` or threat-model statement beyond the README checklist. | P3 |
| IMPLEMENTATION_LOG claims "closes M17, M26 for every screen" and "no overflow at 320 px"; both are true only for `Button` and only in the strict sense (see UI-8, UI-11). | P3 |

---

## 16. Technical debt and hidden risks

1. **Delete-and-reinsert reconciliation** in `ensureDailyPlan` (section 5). Every future
   feature that touches a day will inherit its history-rewriting behaviour until it is
   replaced with update-in-place.
2. **Unvalidated restore** (SEC-1). Every schema change widens the gap between what a backup
   may contain and what `createMany` accepts, and there is no versioned migration of backup
   files.
3. **Untyped backup delegates** (`as unknown as`) hide the previous two from the compiler.
4. **Domain math in components** and **two definitions of overdue / yield average**: the
   "single source of truth" claim is true for the domain layer and false for the app as a
   whole. Each is a divergence waiting to be reported as a bug.
5. **Runtime image carries the build toolchain** so that migration and seeding can run at boot.
   This ties the image size, the vulnerable transitive tree and the "migrate on every start"
   behaviour together; fixing one means fixing all three.
6. **No error boundaries** means every unhandled failure, present and future, is a white
   screen on a phone.
7. **Service worker cache names never change**, so every caching bug is permanent until the
   user clears site data.
8. **Three form patterns and three optimistic-update patterns** mean each new screen picks
   one, and the codebase drifts further.
9. **`@types/node` 24 against Node 22** and exact-pinned dependencies with no Dependabot: the
   pins are good, the absence of a nudge to review them is not.
10. **Screenshots in git** at ~4 MB per slice.

---

## 17. Engineering maturity scores

| Category | Score | Rationale |
| --- | --- | --- |
| Architecture | 7 | Right shape, enforced purity, snapshot design; actions double as services, one 290-line function, math leaked into components. |
| Code quality | 7 | Strict TS, no `any`, lint clean, exact pins, readable comments; 36 `as unknown as`, duplication, dead code. |
| Maintainability | 6 | Feature layout and tests help; large files, three form patterns, no error boundaries, no invariant layer. |
| Database | 7 | Snapshot schema, clean additive migrations, deterministic collation; missing FK indexes, two harmful cascades, redundant index. |
| Testing | 7 | 366 meaningful tests across three layers, immutability and concurrency tested; gaps around mixed states, NaN, manual+measured, and nothing runs them automatically. |
| Security | 5 | Correct primitives (scrypt, constant-time, signed cookie, relation-scoped queries); unvalidated restore, one IDOR, no throttling, non-revocable sessions, scrypt params unused, placeholder secret accepted. |
| Privacy | 7 | No telemetry, no outbound calls, scoped exports; error logs can carry data, backups unencrypted with password hashes. |
| Git practices | 4 | Excellent messages and clean history; nothing pushed, one 43k-line commit, no tags, no PRs. |
| CI/CD | 0 | None exists. |
| Mobile UX | 7 | Genuinely mobile-first and measured; Shopping header at 320 px, sub-44 targets, sheet insets, keyboard. |
| Accessibility | 5 | Good foundations; unassociated errors, hidden progress numbers, heading order, one contrast failure, colour-only charts. |
| PWA | 4 | Installable and readable offline; stale data without indication, update strategy strands sessions, RSC/document confusion, caches never versioned. |
| Deployment | 6 | Non-root, healthcheck, loopback default, good docs; 1.3 GB image, migrate-on-boot without gate, no image versioning, doc figure wrong. |
| Backup/recovery | 4 | Working manual mechanisms with a tested restore; nothing automated, no offsite, unencrypted, source not backed up. |
| Documentation | 8 | Unusually complete and honest; missing Git/release/DR docs, two wrong figures. |
| **Overall** | **5.5** | Code ≈ 7, delivery ≈ 3. Not production-ready; close. |

---

## 18. Prioritized recommendations

**Before anything else (P0)**

1. Push `main` and `feature/ux-redesign` to the remote today. Enable branch protection on
   `main` once CI exists.

**Phase 0/1: the fixes that change what users see or lose (P1)**

2. Fix rebuild-day: default `keepLoggedMeals: true`; reconcile update-in-place; never delete
   non-PENDING journal rows or their completion audit; refuse regeneration of past dates
   without an explicit force; make the success message true.
3. Fix `rawQty`/`cookingRequirements` so Prep's "start with X g raw" is derived from the cooked
   target only.
4. Return `null` macros for non-finite quantities; reject NaN at materialisation.
5. Replace the two UTC date slices with `todayKey()` / `toDayKey()`.
6. Validate backup files with a per-table Zod schema; force `userId` to the restoring user;
   check `version` is an integer.
7. Scope `reorderIngredients` ids to the meal; verify `groceryWeekId` and `foodId` references.
8. Add `error.tsx`, `not-found.tsx`, `global-error.tsx`; wrap action calls in `useAction` with
   `try/catch` and a "Couldn't save, your change is still on screen" toast.
9. Make the service worker mark cached responses and have the UI show "Showing a copy from
   HH:mm; the server is unreachable"; stop caching RSC payloads under path-only keys; version
   the cache name per build; prompt to reload on `controllerchange`.
10. Key `NoteRow`, `WaterCard` and `DayStateControl` by date. Fix the Shopping header at
    320 px. Add the home-indicator inset to footerless sheets.
11. Automate the nightly `pg_dump` inside compose and copy it off-host; verify restore weekly.

**Phase 2/3: security, hygiene, CI (P2)**

12. Login throttling; session version claim invalidated on password change; pass and raise
    scrypt parameters; reject placeholder `AUTH_SECRET`; fix the `next` guard; stop returning
    raw `Error.message`; log error name/code/stack only.
13. CI on every PR: install, lint, typecheck, `prisma validate`, unit, integration (Postgres
    service), build, `npm audit --audit-level=high`; weekly image build with Trivy.
14. FK indexes; `MealIngredient.foodId` → `Restrict` with a guided flow; audit tables →
    `Restrict`; drop the redundant index.
15. Move business rules out of actions; split `ensureDailyPlan`, `grocery.ts`, `prep.ts`;
    one form pattern; one optimistic pattern; remove `router.refresh()` after actions that
    revalidate.
16. One-shot migrate service; compiled seed; drop `prisma`/`tsx` from runtime; image ~300 MB;
    tag images by version.

**Phase 4–6: quality of life (P2/P3)**

17. Accessibility: error association, progress strip semantics, heading order, destructive
    contrast, chart text alternatives.
18. Reconcile the two overdue predicates and the two yield averages; net supplements against
    inventory; exclude today from period stats.
19. Dependabot, Prettier + `.editorconfig`, `CHANGELOG.md`, `LICENSE`, `.nvmrc`, semantic
    version tags starting at `v0.1.0`.

---

## 19. What could not be verified

- The UI-1 crash on a dropped connection was established by reading React 19 transition
  semantics and the absence of any error boundary; it was not reproduced on a device.
- The Next 16 `Vary: RSC` removal (UI-5) was checked in `node_modules/next` source, not in a
  browser.
- The Docker image was inspected as built 30 minutes before the audit from the same tree; a
  clean `docker build` was not re-run.
- Branch protection, PR history and CI status could not be checked because the remote has no
  refs.
- Colour contrast values were computed from the OKLCH tokens, not measured with a tool.
- No load or performance measurement was taken; performance findings are structural.
