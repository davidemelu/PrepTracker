# PrepTracker — Architecture

## 1. Goals that shape the design

| Requirement | Architectural consequence |
| --- | --- |
| Phone-first, one-handed daily use | App Router + server components for data, thin client islands for interaction. Bottom nav, 44px+ tap targets, no desktop tables. |
| Plan must be editable without code changes | **Zero plan data in source.** The seed writes rows; every meal, ingredient, quantity, time, unit and day type is a database row edited through the UI. |
| History must never be rewritten by plan edits | **Snapshot-on-materialise.** A `DailyPlan` copies the plan into `DailyMeal` / `DailyMealItem` / `DailySupplement` rows (names, quantities, units, macros). Editing `MealPlan` later cannot touch past days. |
| Custom day types, not just training/rest | Day types are rows (`DayType`), and quantities are rows keyed by day type (`MealIngredientQuantity`), not `trainingQty`/`restQty` columns. |
| Self-hosted, portable data | PostgreSQL + Prisma migrations, Docker Compose, JSON/CSV export and JSON import. |
| Offline-tolerant | PWA service worker: cache-first for the shell, stale-while-revalidate for pages, so the last viewed day stays readable if the LAN drops. |
| Notifications later, not now | All reminder decisions come from one pure module (`lib/domain/reminders.ts`) that returns descriptors. Today they render as in-app badges; a scheduler or Web Push transport can consume the same descriptors later. |

## 2. Stack

- **Next.js 16** (App Router, React 19) — server components read via Prisma, mutations are **server actions**. No separate API tier to maintain.
- **TypeScript 5.9**, strict.
- **Tailwind CSS v4** + shadcn-style components (Radix primitives + `cva`) vendored into `src/components/ui` — no runtime dependency on a component CDN or generator.
- **PostgreSQL 16** + **Prisma 7** (query compiler + `@prisma/adapter-pg` driver adapter).
- **Zod 4** — one schema per mutation, shared by client form and server action.
- **Recharts 3** for analytics.
- **Vitest** (unit + integration) and **Playwright** (one full end-to-end workflow).
- **Auth**: local username/password only. Scrypt (`node:crypto`, no native deps) + `jose`-signed JWT in an `httpOnly` cookie. No third-party identity provider, no outbound network calls.

### Why server actions over REST
Every mutation is used by exactly one UI. Server actions keep validation, authorisation and revalidation in one file per feature, and remove a whole class of client/server type drift. Two routes remain HTTP endpoints because they are consumed by non-React clients: `/api/export/*` (downloads) and `/api/health` (container healthcheck).

## 3. Layering

```
src/app/**            route segments: layout, page, loading — server components only
src/components/**     presentational + client islands ('use client')
src/lib/actions/**    server actions: auth check -> zod parse -> domain call -> prisma -> revalidate
src/lib/domain/**     PURE functions, no I/O, no Prisma import  <-- the unit-tested core
src/lib/queries/**    read helpers (Prisma -> view models)
src/lib/validation/** zod schemas shared by forms and actions
src/lib/auth/**       session, password hashing, guards
src/lib/db.ts         Prisma singleton + pg pool adapter
```

The hard rule: **`src/lib/domain` may not import Prisma, Next, or React.** Every calculation the user cares about being correct lives there and is unit-tested without a database:

| Module | Responsibility |
| --- | --- |
| `units.ts` | unit registry, mass/volume/count conversion, display formatting |
| `schedule.ts` | generate meal times from first meal / interval / workout / bedtime |
| `materialise.ts` | plan + day type -> the concrete list of meals and items for a date |
| `yield.ts` | raw↔cooked conversion, measured yield, portion counts |
| `grocery.ts` | expand N days into line items, aggregate, subtract inventory, package estimates |
| `nutrition.ts` | per-item -> meal -> day -> week macro rollups (nulls tolerated) |
| `adherence.ts` | meal/supplement/water/overall percentages, weekly stats |
| `water.ts` | totals, remaining, percent, duplicate-submission detection |
| `storage.ts` | fridge/freezer/thaw dates, "move tomorrow's meals" decisions |
| `reminders.ts` | due/overdue descriptors for meals, supplements, water, thawing, prep, shopping |

## 4. Data model (30 tables)

Four families:

**Definition (editable, mutable)** — `MealPlan`, `Meal`, `MealDayTypeSetting`, `MealIngredient`, `MealIngredientQuantity`, `Food`, `FoodOptionGroup`, `FoodOptionGroupMember`, `DayType`, `ScheduleDay`, `Supplement`, `SupplementSchedule`, `Settings`, `AppSetting`.

**Journal (immutable snapshots)** — `DailyPlan`, `DailyMeal`, `DailyMealItem`, `MealCompletion`, `DailySupplement`, `SupplementCompletion`, `WaterEntry`, `DailyCheckIn`.

**Operations** — `GroceryWeek`, `GroceryItem`, `InventoryItem`, `PrepSession`, `PrepTask`, `PrepBatch`, `StoragePortion`, `CookingYield`.

**Identity** — `User`.

Journal tables keep `sourceMealId`/`foodId` as **nullable, `onDelete: SetNull`** references plus a denormalised `name`/`quantity`/`unit`/`state` snapshot. Deleting a food from the plan therefore never deletes or corrupts what was eaten in March.

## 5. Day lifecycle

1. `getOrCreateDailyPlan(date)` — resolves the day type from `ScheduleDay` (weekly pattern) unless the day already has an explicit override.
2. Materialisation copies the active plan's meals for that day type, resolving each option group to the preferred food, and stamps scheduled times from `Settings` + per-meal overrides.
3. The day is now independent. Editing the plan, deleting a food, or changing the water target does not alter it.
4. Re-materialising is explicit and opt-in (`Regenerate day`), and preserves completions where the meal still exists.

## 6. Substitutions

`FoodOptionGroup` (e.g. "Meal 2 protein") has ordered members and a `preferredFoodId`. `MealIngredient` points at **either** a `foodId` (fixed) **or** an `optionGroupId` (choose one). Resolution order when materialising a day:
`DailyMealItem.substitutedFoodId` (today only) → `PlanWeekPreference` (this week) → `FoodOptionGroup.preferredFoodId` (default) → first member.

## 7. Raw ↔ cooked

`Food.cookingYieldPct` is the current effective yield. `CookingYield` is an append-only log (`DEFAULT` seeds, `MEASURED` from prep batches). Recording a `PrepBatch` with raw and cooked weights writes a `MEASURED` row and rolls the food's effective yield to a moving average of the last N measurements, so accuracy improves with use. `raw = cooked / (yield/100)` is the only formula, implemented once in `domain/yield.ts`.

## 8. Deployment

Multi-stage Dockerfile (deps → build → runner) producing a Next standalone image running as a non-root user. `docker-compose.yml` runs `app` + `db` with a named volume for Postgres, a healthcheck gate, and an entrypoint that runs `prisma migrate deploy` then seeds only when the database is empty. Bound to `127.0.0.1` by default; LAN, Tailscale and Caddy options are documented rather than assumed.
