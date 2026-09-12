# Ambiguous requirements and the assumptions made

Every assumption below is a **data value or a default**, not a hard-coded behaviour. All of them are editable in the UI.

| # | Ambiguity | Assumption | Where to change it |
| --- | --- | --- | --- |
| 1 | "2 eggs", "2 bagels", "1/2 avocado" have no mass unit | Modelled as the count unit `each`, quantity `2` and `0.5`. Avocado is therefore `0.5 each`, not `100 g`. | Plan → meal → ingredient unit |
| 2 | Meal 3 is "pre-workout" but the workout time varies | Meal 3 is flagged `preWorkout` and pinned `preWorkoutMinutes` before **that day's** session, which is stored per day on `DailyPlan.workoutTime` and set from the Today screen. Meal 4 is pinned after training, the last meal sits in the `lastMealEarliest`–`lastMealLatest` window, and everything else is spread evenly between those points inside `mealIntervalMinutes`–`mealIntervalMaxMinutes`. Seeded at 08:00 / 3–4 h / 60 min / 21:00–23:00. A 19:30 session gives 08:00, 13:15, 18:30, 21:00, 23:00 — the run-up is 5.3 h because five meals cannot cover 08:00 to 18:30 at four hours each, which the generator reports rather than hides. A 17:00 session fits the plan exactly and reports nothing. | Today → workout card, Settings → Meal timing |
| 3 | "Meal 3: 5:30 PM to 6:00 PM" is a range | Stored as a start time plus an optional `windowMinutes` (30). Cards show "5:30–6:00 PM". | Plan → meal → time window |
| 4 | Workout "approximately 7:30–8:30 PM" | Stored as `workoutTime` 19:30 + `workoutDurationMinutes` 60. | Settings → Meal timing |
| 5 | Rest-day Meal 5 has "0 g rice" | Seeded as a real ingredient with rest quantity `0`. Items with quantity 0 are hidden on the day card but remain in the plan, so switching to a training day restores them. | Plan → Meal 5 → rice |
| 6 | "1/4 tsp pink salt with each meal" — per meal or per plan? | Seeded as a real ingredient (`0.25 tsp`, category Seasonings) on **every** meal, so it aggregates correctly into groceries. Toggleable per meal. | Plan → meal → Pink salt |
| 7 | "175 g cooked chicken breast OR ground turkey" appears in meals 2 and 4 | One shared option group, "Meal 2 & 4 protein", used by both meals, so changing the preference changes both and groceries aggregate to one line. | Plan → Option groups |
| 8 | Vitamin D "3000 IU" and magnesium "500 mg" flagged as provisional | Seeded at those values; both editable including the unit. `IU` is a supported supplement unit. | Supplements |
| 9 | Water target 4 L | Seeded `4000 mL`, quick-add buttons 250/500 mL. The day snapshots the target so changing it later does not rewrite past adherence. | Settings → Water |
| 10 | "Estimated packages" needs a package size | Each food has an optional `packageSize`/`packageUnit`. Where unknown the grocery list shows the required amount and omits the package estimate rather than inventing one. | Foods → package size |
| 11 | Cooking yields given as ranges (75–80%) | Midpoint seeded: chicken 75, ground turkey 78, lean beef 78, steak 75, salmon 80. Marked `DEFAULT`; your first measured batch overrides it. | Prep → Yields |
| 12 | "Days 1–3 fridge, days 4–7 freezer" | Seeded as `fridgeDays = 3`, and portions beyond that are suggested for the freezer with a thaw date one day before use. Suggestions only — you assign portions yourself. | Settings → Storage |
| 13 | Grocery planning horizon | Defaults to 7 days, 5 training / 2 rest, prefilled from the weekly schedule but editable per grocery week. | Groceries → new week |
| 14 | "Subtract inventory where practical" | Subtracted only when the inventory item is linked to the same food **and** the units are convertible. Otherwise the item is listed with a "you may already have this" note rather than a silently wrong number. | Inventory |
| 15 | Single user, but schema has `User` | One user row, created at first run. Every user-owned table carries `userId` so multi-user is a routing change, not a migration. | — |
| 16 | Timezone | All dates are handled as calendar dates in the server's local timezone (`TZ` env var, default `UTC`). Set `TZ` in `.env` to your own zone so "today" flips at your midnight. | `.env` → `TZ` |
| 17 | Week start | Monday, matching the Mon–Sun weekly tracker you described. | `docs` / `WEEK_START` constant in settings |
| 18 | Duplicate water submissions | Two identical amounts within 10 seconds are flagged and require confirmation; not silently blocked. | Water card |
| 19 | "1.5 hours before any leg day" — which sessions count as legs? | Nothing in the code knows what a leg day is. Each workout focus carries its own optional `preWorkoutMinutes`; Legs, Quads, Hamstrings, Glutes, Calves and Lower are seeded at 90, everything else inherits the 60-minute default. A session takes the **longest** gap any of its focuses asks for, so legs + calves still eats 90 minutes out. | Plan → Workouts → focus |
| 20 | "Last meal at like 9pm–11pm" — a target or a hard limit? | A target window, not a constraint. The last meal is placed inside it when the day allows, and the meals before it spread out to reach it. Where an anchor makes that impossible the meal still lands as close as it can and the shortfall is reported. Bedtime remains a separate, harder guard. | Settings → Meal timing |

## Deliberately not built (and why)

- **Store aisle mapping** — you asked to defer it. Shopping mode groups by `department`, which is the field aisle mapping would key off later.
- **External food database / barcode** — v1 is manual nutrition entry by request. `Food.externalId` + `externalSource` columns exist so an importer can backfill without a migration.
- **Push notifications** — opt-in browser notifications are implemented for foreground reminders; server-driven Web Push needs a VAPID key pair and a scheduler, which would mean a background worker. The descriptor layer is in place for it.
- **Medical advice** — supplements are tracked as user-entered items only. No dosage validation, interaction checking, or recommendation exists anywhere in the codebase.

## Decisions made while building

| Area | Decision | Reasoning |
| --- | --- | --- |
| Custom day types | Training and Rest are seeded; a third type is created from the UI (Plan → Weekly schedule → Day types → Add), which copies quantities from an existing type so it does not start at zero for every ingredient. | Seeding an unused "Custom" day would have put a meaningless column in every ingredient row. Adding one is two taps and produces sensible starting values. |
| Rice as a tracked yield | White rice is seeded with `tracksYield` and a **300%** yield, so 3.7 kg of cooked rice converts to 1.23 kg of dry rice on the shopping list. | The plan is written in cooked rice weights, exactly like the meat. One formula covers both, which is also why yields above 100% are allowed with a confirmation. |
| Above-100% yields | Confirmed once, when the value is first set or changed — not every time the food is edited. | Being made to re-confirm rice's 300% yield just to rename it trains you to click through warnings, which is how the real mistakes happen. |
| Low stock reminders | All low-stock items collapse into a single reminder. | The seed creates fourteen inventory rows at zero. One card per item buried the overdue-meal and thaw reminders on a fresh install. |
| Vegetables as a prep batch | Frozen vegetables are planned in cooked weight, so Prep Day creates a batch for them alongside the proteins. | It matches the plan, and portioning 21 × 100 g of vegetables is real prep work worth tracking. Set them to `AS_IS` if you would rather they were not. |
| Browser notifications | Opt-in, foreground only, and only for overdue items. | Anything more needs Web Push, a VAPID key pair and a background scheduler. The reminder rules already return transport-agnostic descriptors, so adding that later touches no logic. |
| Nutrition seed values | Approximate per-100 g figures are seeded for the staple foods and are marked as editable estimates in the UI. | An empty nutrition layer looks broken; invented precision is worse. Replace them with your own packaging values. |
