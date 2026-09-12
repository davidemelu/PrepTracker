# PrepTracker UX Audit

Audit of the user experience and visual design of PrepTracker as it exists today, with a proposed
direction. This is a design document, not an engineering review. Findings reference the current
component files so the later engineering audit can pick them up, but the recommendations are about
what a person holding a phone in a kitchen experiences.

Companion document: [UI_DESIGN_SPEC.md](UI_DESIGN_SPEC.md) holds the screen-level specifications and
the design system. High-fidelity mockups of the main screens live in the "PrepTracker Mobile
Redesign" design canvas: https://claude.ai/code/artifact/2665b5aa-b44f-4f25-a8b2-a7c19653fa4c
(sources in `docs/mockups/`, regenerated with `node docs/mockups/build-artboards.mjs`).

---

## 0. Scope and method

**What was inspected.** Every route and component under `src/app/(app)` and `src/components`:
Today, Plan (meals, meal editor, foods, substitutions, supplements, schedule, workouts, timing,
weekly tracker, plans), Prep (overview, session, storage, yields), Groceries (overview, list,
Shopping Mode), More (settings, history, analytics, inventory, bulk, backup, account), plus the
login, offline page, service worker, bottom navigation, sheets and the shared UI primitives.

**How.** Code reading of every screen, then a seeded production build was run on an isolated
database (the project's own end-to-end seed: five meals, eight supplements, one grocery list, one
prep session) and captured with Playwright at 320, 375 and 390 px, in light and dark mode, and with
the root font size raised 60 % to simulate large accessibility text. Horizontal overflow and page
height were measured on every screen. No production data was touched and no application code was
changed for this audit.

**Against what.** Nielsen's ten usability heuristics, WCAG 2.2 AA, Apple Human Interface
Guidelines (touch targets, reachability, sheets), Material 3 (navigation bar, state layers), and
the interaction patterns of the reference apps named in the brief. The brief's primary principle
was used as the yardstick throughout:

> Daily actions should take seconds. Planning actions can take longer.

**Reference-app patterns that were borrowed (and not copied).**

| Product | Pattern taken | Why it fits PrepTracker |
| --- | --- | --- |
| Apple Fitness / Health | One summary object at the top, detail below; rings used sparingly | A single "how is today going" object beats four competing rings |
| WaterMinder | Preset quick-add buttons with the unit shown, undo always visible | Water is the highest-frequency action |
| Strong / Hevy | "Start from a template" chips before free-form editing | Workout presets before body-part chips |
| MacroFactor / Cronometer | Timeline of meals with the next one emphasised, collapsed past meals | Meals are a sequence in time, not a list of equals |
| Things | Progressive disclosure: collapsed rows, detail in a sheet | Keeps Today short without hiding anything |
| Todoist | Optimistic completion with an inline undo, no success toast | Completion feedback belongs in the row, not in a banner |

---

## 1. Executive summary

PrepTracker has strong bones. The daily model (snapshot days, training and rest portions, quick
water, supplement rows) is right, the component base is consistent (one button, one card, one
sheet), inputs already avoid iOS zoom, and Shopping Mode is genuinely good. The engineering behind
the UI is careful.

The user experience problems are almost all **hierarchy and distance** problems: the things you do
fifty times a week are far from your thumb, and the things you do once a week sit at the top of the
screen. The Today screen answers "how am I doing?" before it answers "what do I do next?", and it
takes 1.8 screens of scrolling to reach the first "Mark as eaten" button.

### The seven biggest problems

1. **Today is a dashboard, not an action screen.** Order today: date stepper, four progress rings
   and macros, up to three reminder banners, a next-meal card with no action, workout card, water
   card, then meals. Measured at 390 px the page is 3,461 px tall (4.1 screens); the next meal's
   "Mark as eaten" is 1.8 screens down and supplements are 3 screens down. Nothing above the fold
   can be tapped except the day stepper. (Critical)
2. **Training / Rest is disguised as a status pill.** The single most consequential control on the
   screen is a 30 px tall badge in the top-right corner, styled like a label, with no visible
   affordance, unreachable one-handed. Switching it silently rebuilds the day, including the
   portions of meals already marked eaten, with no warning. (Critical)
3. **No feedback while the server works, and no offline signal.** There are no loading states on
   any route; tapping a tab shows nothing until the server responds. Most buttons only grey out
   while pending. The service worker serves stale pages that look current with no banner, and a
   failed save is a generic toast. (Critical)
4. **Every meal card is fully expanded, always.** Five cards, each with the full ingredient list,
   substitution hints and a full-width button, regardless of whether the meal is eaten, next, or
   nine hours away. (High)
5. **Correcting "time eaten" is a four-step chore.** More-menu, "Time eaten", native picker, Save.
   The "Eaten 12:41 PM" text on the card is not tappable. (High)
6. **Colour contrast fails in light mode for the two most important semantic colours.** Success text
   and the green "Mark as eaten" button are 3.7:1, warning text is 2.6:1 (AA needs 4.5:1). Pinch
   zoom is disabled in the viewport meta. (High, accessibility)
7. **Planning screens expose every field at once.** Prep batches show six inputs per food before you
   have cooked anything; the workout sheet shows nineteen chips, a name field and an auto-saving
   time input in one scroll; the grocery planning list stacks three lines of text and two 32 px
   ghost buttons per item. (High)

### What is already good and should be kept

- The five-tab bottom navigation, with icons and labels, 64 px tall, correct `aria-current`.
- Shopping Mode: full-row tap targets, 44 px tick, department grouping, "N left" counter, undo.
- Bottom sheets instead of page navigation for every form; sticky footer actions.
- Native `<select>` and numeric-keypad inputs, 16 px minimum input text, no iOS zoom on focus.
- Optimistic water logging with duplicate-tap protection and undo.
- The snapshot model behind "today only" changes, and the honest copy explaining it.
- Reduced-motion support, focus-visible outlines, labelled form fields, `aria-pressed` chips.
- Dark mode tokens: every dark-mode pair measured passes AA.

---

## 2. Heuristic assessment

| Heuristic | Rating | Evidence |
| --- | --- | --- |
| Visibility of system status | Weak | No loading states; pending = greyed button; offline invisible; day-type change gives only a toast; summary ring shows red "21 % complete" at 8 am (a partial day scored as a failure) |
| Match with the real world | Good | "Mark as eaten", "Eaten 12:41 PM", "Buy 3.27 kg · 4 × 1 kg packs" read naturally. Leaks: "Rebuild this day from the plan", "Cascade", "inventory not applied", "Supps", "299P · 391C · 71F" |
| User control and freedom | Mixed | Undo exists for meals, water, shopping. Deleting a storage portion, ingredient, substitution group, inventory or grocery item has no confirmation and no undo; others use a native `confirm()` |
| Consistency | Mixed | One button/card/sheet system (good). But three card-header styles on Today, three ways to present a "primary" header action, `size="sm"` buttons at 36 px next to 44 px ones, date and time inputs restyled inline eight times |
| Error prevention | Weak | Day-type switch rewrites completed meals with no warning; workout time input auto-saves and re-times the whole day on change while sibling fields need Save; storage delete is a one-tap ghost icon |
| Recognition over recall | Mixed | Plan page shows "225 g / 175 g" and expects you to remember which is Training; water buttons show "250" / "500" without a unit |
| Flexibility and efficiency | Weak on Today, good elsewhere | Water is one tap (good). Meal completion needs a scroll; time correction is four taps; workout selection is 2 + n taps with no presets applied on tap |
| Aesthetic and minimalist design | Weak on Today and Prep | Four rings + macro line + three banners before the first action; six inputs per prep batch; substitution hints on every ingredient row |
| Error recovery | Adequate | Errors are plain sentences in toasts; forms show field errors inline. Missing: "your change is kept" reassurance, retry affordance |
| Help and documentation | Good | Inline explanations under controls are well written and honest, occasionally too long for a phone |

---

## 3. Findings, ranked

Severity: **Critical** blocks the core daily loop or damages data; **High** materially slows daily
use or fails accessibility; **Medium** friction or inconsistency; **Low** polish.

### Critical

| ID | Screen | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| C1 | Today | The primary daily action is not reachable without scrolling. Next-meal card shows only name and time; the first "Mark as eaten" is 1.8 screens down; water quick-add buttons are just under the fold at 390 px | `today-390.png`, page height 3,461 px; `src/app/(app)/today/page.tsx` order | Make the next meal the hero: name, purpose, time, countdown, ingredients with amounts and one 52 px "Mark eaten" button, placed directly under the day-state row. Water quick-adds immediately after |
| C2 | Today | Training / Rest control is a badge in the header. 30 px tall, top-right, no button styling, no label | `day-type-switcher.tsx` wraps `Badge` in an unstyled `<button>` | A segmented control (Training \| Rest) at the top of the body, 44 px, full width, with the workout label under it. Custom day types appear as a third segment or an overflow |
| C3 | Today | Changing day type regenerates the day including meals already completed; portions on eaten meals change silently | `setDayType` → `ensureDailyPlan(regenerate: true)`; day-service keeps status but re-materialises items | If any meal is COMPLETED or SKIPPED, show a confirmation sheet: "2 meals are already logged. Keep them as eaten (recommended) / Change their portions too / Cancel". Never change a completed meal's quantities without an explicit choice |
| C4 | All | No loading state on any route; no pending indicator on most mutations | No `loading.tsx` anywhere; `useAction` only toggles `disabled` | Add route skeletons (header + 3 card placeholders), a pending spinner inside the pressed button, and optimistic updates for meal and supplement completion like water already has |
| C5 | All (PWA) | Stale cached pages look current; queued or failed actions are not distinguished | `sw.js` network-first with silent cache fallback; no `navigator.onLine` usage anywhere | Offline banner under the header: "Offline · showing your last synced plan". Failed mutation copy: "Couldn't save. Your change is still on screen. Try again." Queued writes are a later engineering step; the UI states should exist first |

### High

| ID | Screen | Finding | Evidence | Recommendation |
| --- | --- | --- | --- | --- |
| H1 | Today | Every meal card fully expanded (ingredients, substitution hints, notes, full-width button) for eaten, current and future meals alike | `meal-card.tsx`; 5 cards ≈ 1,300 px | Three card states: **collapsed** (eaten and far-future: one row, 56 px, name · time · status), **next** (expanded hero), **expanded on tap**. Ingredients hidden on collapsed rows |
| H2 | Today | Day summary: 88 px ring + three 64 px rings + macro line. At 320 px the three small rings touch; at 160 % text they overlap and "750 mL" wraps. "Supps" abbreviation. Red "poor" band at the start of every day | `today-320.png`, `today-largetext-390.png`; `adherenceBand` applied to a partial day | Replace with one compact progress row: three inline stats "Meals 1/5 · Water 0.75/4 L · Supps→Supplements 2/8", each with a thin bar. No overall percentage during the day; band colours only for completed days (History/Week). Macros move behind a tap |
| H3 | Today | Correcting time eaten: ⋮ → Time eaten → picker → Save (4 taps). "Eaten 12:41 PM" is static text | `meal-card.tsx` sheets | Make the eaten-time chip tappable (opens the time sheet directly, 2 taps + picker). After "Mark eaten", show "Eaten 12:41 PM · Edit" inline on the card instead of a toast |
| H4 | Today | Workout sheet mixes commit models: the time input auto-saves and re-times the whole day; name and chips need Save; "Use this weekday's usual workout" applies and closes immediately. 19 chips before the presets | `workout-card.tsx`, `workout-sheet.png` | Split into: presets first (Push, Pull, Legs, Upper, Lower, Full Body) as one-tap apply; body-part chips below; time and name under "More". One commit model per sheet |
| H5 | Today | Up to three reminder banners sit between the summary and the next meal; meal reminders link to `/today` (the page you are on) | `reminders-banner.tsx`, `today-390-fold.png` | One line, not three: "Prep day is today · 14 items left to buy · 14 items low on stock" as a single dismissible strip below the hero, or fold meal/supplement reminders into the rows they concern |
| H6 | Today | Notes & check-in card: always-visible textarea that autosaves on blur; a sheet with four ratings and five textareas | `check-in-card.tsx` | Single "Add a note" row at the bottom; check-in ratings in the sheet, textareas collapsed under "More notes" |
| H7 | Today | Supplements always fully expanded (8 rows ≈ 450 px); "All" button ambiguous | `supplements-card.tsx` | Group headers become tappable summaries: "Morning ✓", "Pre-workout · 1 left", "Before bed · 1 left". Expand the group with remaining items by default. Rename "All" to "Take all" |
| H8 | Today | Water buttons show "250" and "500" with no unit; undo is icon-only; "Custom" wastes a quarter of the row | `water-card.tsx` | "+250 mL" and "+500 mL" as two large primary tonal buttons (52 px), undo as a labelled text button "Undo 250 mL", custom under "…" |
| H9 | Colour | Light-mode success text 3.7:1, warning text 2.6:1, rest 3.6:1 on white; white on the green "Mark as eaten" button 3.7:1 | Measured from `globals.css` tokens | Darken light-mode success to oklch(0.48 0.13 150) (6.2:1) for text and oklch(0.55 0.14 150) for fills (4.6:1 with white); warning text oklch(0.53 0.13 70) (5.4:1). Keep the lighter tints for backgrounds only |
| H10 | Viewport | `maximumScale: 1` disables pinch zoom | `src/app/layout.tsx` | Remove it; use `touch-action: manipulation` on the shopping rows to stop double-tap zoom (WCAG 1.4.4) |
| H11 | Prep session | Every batch shows raw, cooked, portion size, containers, save and store at once; six inputs × four foods before any cooking | `prep-session-390.png` | Guided step per batch: 1 Weigh raw → 2 Cook → 3 Weigh cooked (shows real yield and portions) → 4 Store (fridge / freezer split). One input visible per step, a progress rail across batches |
| H12 | Grocery list | Planning rows stack three text lines plus two 32 px ghost buttons; "Already have" toggle below 44 px | `grocery-list.tsx` | Row: checkbox, name, "Buy 3.27 kg · 4 packs" on one line; detail and actions in a tap-to-open sheet. "Already have" becomes a swipe or sheet action |
| H13 | Groceries / Prep | Create actions are 36 px header buttons; the empty states have no action button | `new-week-sheet.tsx`, `groceries/page.tsx` | Empty state with the primary button ("Generate this week's list"); when a list exists, show it as a large card with "Shop" as the primary action |
| H14 | Weekly tracker | Horizontal overflow at 320 px (scroll width 385); summary `dl` with fixed 96 + 48 + 80 px columns; actual times crammed into one truncated line | `week-320.png` measured | Rebuild as the brief's pattern: per day "MON · Training · Chest + Triceps · 5/5 meals · 4 L" with the score; expand a day to see actual meal times |
| H15 | Destructive actions | Native `confirm()` for some deletes, none for storage portion, ingredient, group, inventory item, grocery item | grep of `confirm(` and `remove.run` | One confirmation sheet component for permanent deletes; inline undo for reversible ones |
| H16 | Feedback | Success toasts for routine actions ("Note saved.", "Meal 2 eaten at 12:41 PM.") at top-centre, covering the header | `use-action.ts` default `successToast` | Toasts only for errors and for actions whose result is off-screen. Completion feedback lives in the row |

### Medium

| ID | Screen | Finding | Recommendation |
| --- | --- | --- | --- |
| M1 | Today header | "Friday, 11 September 2026" truncates at 320 px next to the badge | "Fri 11 Sep" in the header; the long date is not needed twice |
| M2 | Today | Day stepper (Yesterday / Tomorrow) is the first row on the screen and consumes 44 px of prime space for a weekly action | Move to the header date (tap to open the week strip) or a swipe; keep "Back to today" when browsing |
| M3 | Today | Macro line "3450 kcal · 299P · 391C · 71F" uses single letters | "3,450 kcal · 299 g protein · 391 g carbs · 71 g fat", shown in the expanded summary only |
| M4 | Today | Meal item substitution hints "or Ground turkey" on every card | Show a small "Swap" affordance only on the expanded card; hint text removed |
| M5 | Today | Skipped meals at 60 % opacity reduce text contrast below AA | Use a "Skipped" chip and muted text colour, never opacity on text |
| M6 | Today | Three badges can crowd a meal title row at 320 px (Pre-workout, Next, Overdue) | Purpose (Pre-workout) becomes secondary text; Next is conveyed by position and the hero; Overdue is a single state chip |
| M7 | Icons | Icon-only controls: ⋮ options, undo water, + in shopping, trash in storage, theme radio group | Add visible labels except where the icon is universal and 44 px (the + in shopping is acceptable) |
| M8 | Plan | Meal list shows "225 g / 175 g" with the legend only in the section title | Two labelled columns "Training · Rest" per card, or a toggle at the top of the page to view one day type at a time |
| M9 | Plan IA | Eight flat "Set up" links; "Weekly tracker" (a review screen) lives under Plan | Group into "Routine" (Schedule & workouts, Meal timing, Supplements) and "Library" (Foods, Substitutions, Plans). Move the weekly view to Today's header and More → History |
| M10 | Settings | Water target, quick-adds, storage, plan days, reminders on one page with four Save buttons; timing and day types elsewhere with a footnote explaining where | Settings groups: Water · Meals & timing · Training days · Storage & prep · Reminders · Appearance; one save per group or autosave with an inline "Saved" state |
| M11 | Settings | Water target "apply to today" uses the UTC date, not local | Use the local day key (engineering note, but user-visible late in the evening) |
| M12 | Shopping | Sticky control bar hard-codes `top-[57px]`; breaks in standalone PWA with safe-area top or when the title wraps | Position relative to the header via a CSS variable or make the whole control bar the header |
| M13 | Shopping | Package hint "12 · 2 × 6" is cryptic | "12 · 2 packs of 6" |
| M14 | History | Five tabs in a snap rail; the last tab clips at 320 px with no scroll cue | Four tabs (merge Yields into Prep) or a segmented control that wraps |
| M15 | Analytics | Legends by colour name ("Overall in blue, meals in green, water in light blue") | Labelled series (inline end labels) and a text summary line under each chart |
| M16 | Progress ring | Sublabel at 10 px ("COMPLETE") | 12 px minimum anywhere in the app |
| M17 | Header actions | `size="sm"` buttons (36 px) used as primary header actions (+ Meal, + List, + Prep) | 44 px header actions; primary create actions belong in the body |
| M18 | Empty state (meals) | "Either no plan is active or no meals apply to this day type." | "No meals planned for today." + "Open your plan" button |
| M19 | Day type sheet | "Rebuild this day from the plan" | "Update today from your plan" with the same explanatory sentence |
| M20 | Storage | Row actions are 32 px ghost buttons; delete is a bare trash icon with no confirmation | 44 px actions; "Move to fridge" as the row's primary action; delete behind the row's sheet |
| M21 | Weekly tracker | "Not tracked · Open this day to generate it from your plan" repeated for each unopened day | Untracked past days: "No record"; future days: show planned day type and workout only |
| M22 | Fonts | `--font-geist-sans` is referenced but never loaded; the app silently uses the system font | Declare the system font stack intentionally (it is the right choice for this app) and drop the unused variable |
| M23 | Meal editor | Ingredient rows show every day type's quantity stacked on the right; the form asks source, unit, weighed state, quantities, required, notes in one sheet | Keep, but order the sheet: Food → Amount per day type → (Advanced: unit, weighed, required, note) |
| M24 | Timing | "Cascade" card title; long explanatory paragraph | "Automatic meal times" with a one-line description and a "How it works" disclosure |

### Low

| ID | Finding | Recommendation |
| --- | --- | --- |
| L1 | Bottom nav active state is colour and stroke weight only | Add a 4 px indicator dot or pill behind the icon (Material 3) |
| L2 | "Plan: Current plan" footer on Today | Move to Plan; unnecessary on Today |
| L3 | `richColors` toasts are saturated | Use the app's own semantic tokens for toasts |
| L4 | Theme toggle is icon-only radios | Fine in More; add labels under the icons |
| L5 | Login page is fine | Keep |

---

## 4. Mobile issues (measured)

| Measurement | 320 px | 375 px | 390 px | At 160 % text (390) |
| --- | --- | --- | --- | --- |
| Today page height | 3,541 px (4.2 screens) | 3,461 px | 3,461 px (4.1 screens) | taller |
| Horizontal overflow, Today | none | none | none | **yes** (401 px) |
| Horizontal overflow, Weekly tracker | **yes** (385 px) | none | none | not measured |
| First tappable daily action below the fold | water buttons | water buttons | water buttons | everything |
| Summary rings | touching | tight | ok | overlapping |
| Header date | truncated | ok | ok | truncated |

Touch target inventory (from component sizes):

| Control | Size | Verdict |
| --- | --- | --- |
| Bottom nav items | 64 px tall | Good |
| Mark as eaten, water quick-add, primary buttons | 48 px | Good |
| Supplement rows, prep task rows, shopping rows | ≥ 48 px | Good |
| Focus chips, day-type options | 44 px | Good |
| Header actions, `size="sm"` buttons (Edit, Rename, + Meal, + List, Add) | 36 px | Below 44 |
| Rating buttons, theme toggle, icon-sm buttons | 36 px | Below 44 |
| Back chevron, sheet close | 40 px | Borderline |
| Grocery row ghost actions, storage row actions | 32 px | Fail |
| Day-type badge button | ≈ 30 px | Fail, and it is the most important control |

Reachability: at 390 × 844 the top 25 % of the screen (header, day stepper, top of summary) is
outside the comfortable one-handed zone. Today currently places the day-type control, the date
stepper and the summary there, and every action at the bottom of a long scroll. The redesign
inverts this: state at the top is read-only glance information; the segmented control, hero
action and water buttons sit in the middle third at page load.

Desktop: the 768 px max-width column with a fixed bottom bar is acceptable. At ≥ 1024 px the
bottom bar should become a left rail and Today should use two columns (hero + water left, meals
right). This is a layout change, not a redesign, and is specified in the UI spec.

---

## 5. Accessibility findings (WCAG 2.2 AA)

| Ref | Criterion | Status | Detail |
| --- | --- | --- | --- |
| A1 | 1.4.4 Resize text / 1.4.10 Reflow | **Fail** | `maximumScale: 1` blocks zoom; at 160 % text Today overflows horizontally and rings overlap |
| A2 | 1.4.3 Contrast (minimum) | **Fail (light)** | success text 3.7:1, warning text 2.6:1, rest text 3.6:1, white on success button 3.7:1. Dark mode passes everywhere (5.0 to 8.6:1) |
| A3 | 1.4.1 Use of colour | **Fail** | Analytics legend by colour name; water chart "green bars hit the target"; day-type colour dot is the only difference between custom day types in some rows (name is present, so partial) |
| A4 | 2.5.8 Target size (minimum 24 px) | Pass | All targets ≥ 24 px; many are below the 44 px the brief requires |
| A5 | 1.3.1 Info and relationships (headings) | Partial | Today has an h1, section h2s, meal h3s; but Water uses a `span` title, Supplements uses an h3 with no h2 section, storage summary uses h2 inside a link |
| A6 | 4.1.2 Name, role, value | Pass | Icon-only buttons carry `aria-label`; chips use `aria-pressed`; nav uses `aria-current` |
| A7 | 2.4.7 Focus visible | Pass | Global `:focus-visible` outline, ring on buttons |
| A8 | 3.3.2 Labels | Pass | Every input has a label; number inputs use `inputMode="decimal"` |
| A9 | 2.3.3 Animation from interactions | Pass | `prefers-reduced-motion` honoured globally |
| A10 | 4.1.3 Status messages | Partial | Toasts are live regions; optimistic water total and supplement ticks change without announcement; "N left" in shopping is not live |
| A11 | 1.4.11 Non-text contrast | Partial | Ring track and progress track at oklch 0.96 on white ≈ 1.1:1 (decorative, acceptable); input borders 0.91 ≈ 1.4:1 (below 3:1) |
| A12 | Screen reader flow on Today | Weak | The first meaningful landmark after the header is a decorative ring group; the hero action should be first in DOM order |

---

## 6. Microcopy audit

Good already: "Mark as eaten", "Eaten 12:41 PM", "Today only. Your saved plan is not changed.",
"Nothing needs moving out of the freezer right now.", "Everything is in the trolley".

| Current | Problem | Proposed |
| --- | --- | --- |
| Training (badge) | Reads as a label, not a control | Segmented control "Training · Rest" with the workout underneath |
| Rebuild this day from the plan | Engineering verb | Update today from your plan |
| Cascade (timing card title) | Internal concept | Automatic meal times |
| inventory subtracted / inventory not applied | Passive, technical | Uses what you already have / Ignores your inventory |
| Supps | Abbreviation | Supplements |
| 299P · 391C · 71F | Single-letter macros | 299 g protein · 391 g carbs · 71 g fat |
| + 250 / + 500 | No unit | +250 mL / +500 mL |
| All (supplements) | Ambiguous | Take all |
| Un-skip | Awkward | Undo skip |
| Either no plan is active or no meals apply to this day type. | Two engineering reasons | No meals planned for today. |
| Time eaten (menu item) | Fine, but hidden | Eaten 12:41 PM · Edit (inline) |
| 12 · 2 × 6 | Cryptic | 12 · 2 packs of 6 |
| Not tracked · Open this day to generate it from your plan | Long, repeated | No record (past) / Planned: Training (future) |
| Session options / List options (⋮) | Fine | Keep, add visible "More" label on wide screens |
| Something went wrong. Please try again. | Says nothing about the user's change | Couldn't save. Your change is still on screen. Try again. |

Internal terms found in the UI that should never appear: rebuild, cascade, regenerate, applied,
materialise (in a tooltip), snapshot (in a description), day type (acceptable in Plan; on Today say
Training / Rest).

---

## 7. Information architecture

### Current map

```
Today ─ date stepper · summary rings · reminders · next meal · workout · water · meals ·
        supplements · notes/check-in
Plan ─ meals (editor) · Set up: Foods · Substitutions · Supplements · Weekly schedule ·
        Workouts · Meal timing · Weekly tracker · Switch plan
Prep ─ Storage · Cooking yields · Prep sessions → session (batches, tasks)
Groceries ─ Lists → list (planning) → Shopping Mode
More ─ Inventory · Buy in bulk · History · Analytics · Settings · Backup & export · Account
```

Problems: the weekly review lives in Plan (a setup area); settings are split across More → Settings
and Plan → Timing / Schedule; Groceries and Prep open on a list of past items rather than the one
current thing; Today mixes glance information, actions and journaling in one flat stack.

### Recommended map

```
Today      day state (Training | Rest + workout) · NEXT MEAL hero · water · meals timeline ·
           supplements (grouped, collapsed) · note
           header: date → Week view (adherence, tap a day to open it)
Plan       Your meals (editor)
           Routine: Training days & workouts · Meal timing · Supplements
           Library: Foods · Substitutions · Meal plans
Prep       Storage at a glance (Ready · Freezer · Thaw tonight) · Current prep session ·
           Past sessions · Cooking yields
Groceries  This week's list (Shop button) · New list · Past lists
More       History (days, week, check-ins) · Analytics · Inventory · Buy in bulk ·
           Settings · Backup & export · Account · Appearance
```

Why this and not something else:

- **Five tabs stay.** Today, Plan, Prep, Groceries and More each map to a distinct mode of use
  (eating, planning, cooking, shopping, everything else). Splitting Week or Water into a tab would
  add a sixth item for a screen used once a week or a control used from Today.
- **Week view belongs to Today**, not Plan: it is the same data one level up. A "This week"
  entry point in Today's header (tapping the date) matches how Apple Health and Strong expose the
  calendar from the daily screen. It stays reachable from More → History for longer ranges.
- **"Training days & workouts" merges two screens** (Weekly schedule and Workouts) that edit the
  same seven weekdays. One screen, one row per weekday: day type on the left, usual workout on the
  right.
- **Groceries and Prep open on the current item.** Lists of past weeks are archives; the thing you
  came for is this week's list and its Shop button.
- **Settings consolidates** water, meal timing defaults, storage and reminders, with Plan-level
  concepts (day types, timing generator) still linked from Plan. The footnote that currently
  explains where the other settings are disappears.

### Recommended navigation

Bottom bar, five items, icon + 11 to 12 px label, 64 px tall plus safe area, active item marked by
colour, weight and a small indicator pill. Unchanged icons except Today (a "today" calendar mark
reads better than a sun, which suggests theme or weather). On tablets and desktops (≥ 1024 px)
the same five items become a left rail with the same labels.

Secondary navigation: sheets for every edit, `PageHeader` back chevron for drill-downs, a
"This week" text button in Today's header. No hamburger menu, no nested tab bars.

---

## 8. User flows, current versus proposed

Taps count screen taps after the app is open; "scroll" is noted separately. Picker interactions
(native time wheel) count as one.

| # | Flow | Current | Proposed | Target |
| --- | --- | --- | --- | --- |
| 1 | Mark next meal eaten | 1 tap **+ 1.8 screens of scroll** | 1 tap on the hero, no scroll | 1 |
| 2 | Training → Rest | 2 taps (badge, option); no warning | 1 tap on the segmented control; 2 taps if meals are already logged (confirm choice) | 1 to 2 |
| 3 | Choose today's workout | 2 + n taps (card, chips, Save); scroll inside sheet | 2 taps for a preset (Set workout → Push); 3 + n for body parts (→ chips → Done) | 2 to 3 |
| 4 | Log 500 mL | 1 tap (below the fold at 390) | 1 tap, above the fold | 1 |
| 5 | Correct time eaten | 4 taps + picker (⋮, Time eaten, picker, Save) | 2 taps + picker (Eaten chip, picker, Save) or 2 taps with "−15 min / −30 min" quick adjust | 2 to 3 |
| 6 | Check next meal | 0 taps, but only name and time; ingredients need a scroll | 0 taps: name, purpose, time, countdown, ingredients | 0 |
| 7 | Generate weekly groceries | 3 taps (Groceries, + List, Generate) after checking prefilled fields | 2 taps (Groceries, "Generate this week") with defaults; options behind "Adjust" | 2 to 3 |
| 8 | Shop | 3 taps to the first tick (Groceries, list, Start shopping) | 2 taps (Groceries, Shop) | 2 |
| 9 | Sunday prep | Prep, + Prep, Create, then per batch: raw, cooked, portion, containers, Save, Store (≈ 6 fields × 4 batches, no order) | Prep, "Start Sunday prep", then per batch a 4-step guided card (Weigh raw → Cook → Weigh cooked → Store) with Next; tasks list after batches | guided |

Detailed flow specifications with states are in the UI spec.

---

## 9. Interaction recommendations

**Meal completion.** One tap on "Mark eaten" records the current time, flips the card to its
completed state in place (optimistic), and shows "Eaten 12:41 PM · Edit" with an "Undo" text
button. No success toast. The next meal becomes the hero. If the meal was overdue, the delta ("41
min late") shows as secondary text, never as a warning colour, because it is a record not a fault.

**Time correction.** Tapping the eaten-time chip opens a small sheet: a native time input pre-filled
with the recorded time, plus quick adjustments "−15 min", "−30 min", "As planned", "Now". Save.

**Day state.** Segmented control at the top of the body. Changing it with nothing logged applies
immediately (optimistic) and shows the portions change in the meal rows. With logged meals, a
confirmation sheet explains what will and will not change. The active day type is stated in words
under the control ("Training day · Chest + Triceps · 7:30 PM") so the state is never only a colour.

**Workout.** "Set workout" opens a sheet with presets as the first row (Push, Pull, Legs, Upper,
Lower, Full Body). Tapping a preset selects its body parts and can be saved with one more tap, or
saved immediately with a "Use Push" primary button. Body-part chips remain for custom sessions, and
a "Name this session" field sits under a disclosure. Workout time is edited in a separate small
sheet from the day-state row ("7:30 PM · Change") because it has a day-wide side effect.

**Water.** Two large tonal buttons showing the amount with the unit, a thin progress bar, "2.5 L to
go", and "Undo 250 mL" as a text button that appears for ten seconds after a tap and then stays in
an overflow. Custom amount and the entry list are behind "…".

**Supplements.** Grouped by timing with a one-line summary per group; the group with remaining items
nearest to now is expanded; ticking a row is one tap with an optimistic check; "Take all" per
group, not per day.

**Feedback.** Pending state inside the pressed control (spinner replacing the icon), optimistic
state for completions, error toast only when the server rejects, and the change stays visible on
screen with a "Try again" action.

**Offline.** A persistent thin banner under the header when `navigator.onLine` is false or a
navigation is served from cache: "Offline · showing your last synced plan". Actions attempted
offline show "Saved on this device. Will sync when connected." only once a queue exists; until
then "Couldn't save while offline" with the change retained in the control.

**Destructive actions.** Permanent deletes (plan, meal, food, group, session, list) use one
confirmation sheet with the consequence spelled out. Reversible removals (storage portion eaten,
grocery item purchased, supplement ticked) use inline undo.

---

## 10. Design system summary

Full token and component definitions are in the UI spec. Headlines:

- **Type**: system font stack (SF Pro / Segoe UI / Roboto), scale 12 · 13 · 15 · 17 · 22 · 28 · 34;
  numbers always tabular; primary metrics at 28 px semibold.
- **Spacing**: 4-pt scale, page gutter 16 px, card padding 16 px, row height 56 px, section gap 24 px.
- **Radius**: 12 px cards, 10 px controls, full pill for chips and segmented controls.
- **Semantic colours** (light / dark): Completed green, Pending neutral, Upcoming primary blue,
  Missed red, Training green, Rest sky blue, Warning amber. All text-on-background pairs at
  ≥ 4.5:1, all fills with white text at ≥ 4.5:1; state always paired with an icon or a word.
- **Touch**: 44 px minimum, 48 px default rows, 52 px for the three daily primaries (Mark eaten,
  +250 mL, +500 mL).
- **States**: skeleton, pending-in-control, optimistic, error-with-retry, empty-with-action.

---

## 11. Screen-by-screen recommendations

### Today (redesign)
Order: header (date, "This week"), day-state segmented control with workout line, NEXT MEAL hero
with Mark eaten, water row, meals timeline (collapsed rows, expanded next), supplements grouped,
one reminder strip, note. Remove the day stepper row, the four rings, the macro line and the
always-visible textarea from the default view. Target: first action visible at 320 × 568 without
scrolling; page height under 2,000 px at 390 with five meals and eight supplements.

### Meal card (redesign)
Three states: collapsed row (56 px: status icon, name, purpose, planned → eaten time, chevron);
hero (next meal: full ingredients with amounts, Mark eaten); expanded (any meal on tap: ingredients,
Swap on grouped items, Edit amount, Note, Reschedule, Skip in a sheet). Training/rest portions are
whatever the day state is; a small "Training portions" caption on the hero reinforces it.

### Training / Rest selector (new)
Segmented control, 44 px, full width, labels in words, active segment filled with the day-type
colour at AA contrast and a check icon. Below: one line "Chest + Triceps · 7:30 PM · Edit".

### Workout selector (redesign)
Sheet: presets row → body-part chips grouped → "More" disclosure (session name, training time).
Primary button reads "Use Push" when a preset is selected, "Save workout" otherwise.

### Water (redesign)
Row with amount and target, thin bar, two 52 px buttons "+250 mL" "+500 mL", "Undo" text button,
overflow for custom and history.

### Supplements (redesign)
Group summary rows, expand on tap, 48 px item rows with a 28 px checkbox, "Take all" per group.

### Weekly view (redesign)
Header with week range and prev/next, a single stat line ("5 of 7 days on plan"), then one row per
day: weekday and date, Training/Rest word chip, workout, "5/5 meals · 4.0 L · 7/8 supplements",
score. Tap to expand: planned versus actual meal times. No progress-bar table; no overflow at 320.

### Groceries (redesign)
Current list as a large card: name, "12 items remaining", progress, primary "Shop", secondary
"Review list". "Generate this week's list" when none exists. Past lists as a compact list below.

### Shopping Mode (keep, polish)
Keep the row design. Fix the sticky bar offset, show "12 items remaining" as the headline, move
"Hide done" into a segmented "Remaining · All", use "2 packs of 6" phrasing, add `aria-live` to the
counter.

### Prep Mode (redesign)
Session page becomes a stepper: batch 1 of 4 with a four-step card (Weigh raw with the suggested
amount prefilled, Cook, Weigh cooked showing live yield and portions, Store with fridge/freezer
split defaulting to the settings rule). "Next" advances; a rail at the top shows batch progress.
Tasks follow as a checklist. Storage summary uses three labelled tiles: READY, FREEZER, THAW
TONIGHT.

### Plan editor (adjust)
Meals list with a Training · Rest toggle to show one column at a time, or two labelled columns.
Setup links grouped into Routine and Library. Meal detail keeps its sheet-based editing with the
ingredient sheet reordered.

### More / Settings (adjust)
Settings regrouped with one save per group; Appearance moved into Settings; Backup keeps its
typed-confirmation restore.

---

## 12. Screens that are already good

- **Shopping Mode** (best screen in the app; only the sticky offset and the counter phrasing need work).
- **Login** and **Offline** pages.
- **Bottom navigation** (structure and sizing).
- **Bottom sheets** (anchor, sticky footer, close target).
- **Meal editor** and **ingredient form** (sheet-based, labelled, sensible defaults) apart from field order.
- **Substitutions** (this-week choice chips are a good pattern).
- **Backup & export** (typed confirmation for restore is exactly right).
- **Storage "Move to the fridge" card** on the storage page.

---

## 13. Recommended implementation order

1. **Today hierarchy** (C1, C2, H1, H2, H5, H6, H8, M2): reorder the page, add the segmented
   control, the next-meal hero, collapsed meal rows, water row. This is one page and delivers the
   brief's "open → tap → close" loop. No data model change.
2. **Safety and feedback** (C3, C4, C5, H15, H16): day-type confirmation when meals are logged,
   route skeletons, pending-in-control, optimistic completion, offline banner, one confirmation
   sheet, quieter toasts.
3. **Accessibility and tokens** (H9, H10, M5, M16, A-series): contrast-safe success and warning,
   remove `maximumScale`, minimum 12 px text, heading order on Today.
4. **Time correction and workout presets** (H3, H4).
5. **Prep guided flow and Groceries landing** (H11, H12, H13).
6. **Weekly view and Plan grouping** (H14, M8, M9, M10).
7. **Polish** (Medium and Low items).

No CSS or code changes were made during this audit. Every finding above is documented only; the
screenshots that back the measurements are in `docs/audit-screenshots/`.
