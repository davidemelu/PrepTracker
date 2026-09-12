# Implementation log

What has been built from [UX_AUDIT.md](UX_AUDIT.md) and [UI_DESIGN_SPEC.md](UI_DESIGN_SPEC.md),
with the audit finding each change closes. Later slices append to this file.

## Slice 1 · Today screen, safety, feedback, tokens (2026-09-11)

Approved by the user on 2026-09-11 with the instruction to optimise for the iPhone 14 Pro Max.

### Today screen ([today/page.tsx](../src/app/(app)/today/page.tsx))

Order is now: day-state control, workout line, progress strip, next-meal hero, water, meals
timeline, supplements, reminder strip, note row. Closes C1, C2, H1, H2, H5, H6, H7, H8, M2, M3,
M4, M5, M6, M18, M22.

| Component | Replaces | Notes |
| --- | --- | --- |
| `day-state-control.tsx` | `day-type-switcher.tsx` | 48 px segmented Training / Rest control (chip plus sheet beyond three day types). Confirmation sheet when a meal is already logged: keep logged meals as they were, or change all. |
| `workout-line.tsx` | `workout-card.tsx` | One line with Edit / Set workout. Sheet leads with split presets (Push selects Chest, Shoulders, Triceps and so on, matched by name), then body parts, then a "More" disclosure for session name and training time. One commit model: everything saves on Save. |
| `progress-strip.tsx` | `day-summary.tsx` | Three counts with 4 px bars. No overall percentage during the day. Detail sheet holds kilocalories and macros in words and the "Update today from your plan" action. |
| `next-meal-hero.tsx` | next-meal card | Name, purpose, time, countdown or overdue, ingredients with amounts, Swap on grouped items, portions caption, 52 px Mark eaten with a pending spinner. |
| `meal-row.tsx` | `meal-card.tsx` | 56 px collapsed rows (planned → eaten, delta, Next pill, overdue in warning colour). Expands in place: plate, Mark eaten, tappable "Eaten 12:42 PM" chip opening the time sheet with −15 / −30 / As planned / Now, Ate it earlier, Edit amounts, Note, Reschedule, Skip, Undo. |
| `supplement-groups.tsx` | `supplements-card.tsx` | Groups by timing, first group with items left opens by default, per-group Take all, optimistic ticks, no toasts. |
| `water-card.tsx` | itself | Buttons show the unit, 52 px, tonal; "Undo 250 mL" text button; custom amount and today's entries behind "…". |
| `reminder-strip.tsx` | `reminders-banner.tsx` | One row summarising non-meal reminders; sheet lists them with links. Meal and supplement reminders now live on their rows. |
| `note-row.tsx` | `check-in-card.tsx` | One row; note, ratings and detail notes in a sheet. |
| `swap-sheet.tsx` | inline select | One-tap substitution for today. |

Header: short date, previous and next day chevrons (44 px), "Week" link. "Back to today" pill
when viewing another date.

### Safety and feedback

- `setDayType` gained `keepLoggedMeals` (default true). `ensureDailyPlan` copies the items of
  eaten or skipped meals across a rebuild instead of re-portioning them. Closes C3.
- `loading.tsx` skeletons for all five tabs (`ui/skeleton.tsx`). Closes C4 (route part).
- Pending spinners inside the pressed control; optimistic supplements and water. Closes C4 (action
  part) and H16 for Today (success toasts removed from daily actions).
- `layout/offline-banner.tsx`: "Offline · showing your last synced plan…" above the bottom nav.
  Closes the visible half of C5; queued writes remain future work.
- `ui/confirm-sheet.tsx` replaces native `confirm()` on Today; other screens still use the
  browser dialog (H15, remaining).
- New action `completeSupplements` for per-group Take all.

### Tokens and accessibility

- Light-mode success and warning darkened to pass 4.5:1 as text and under white text; Rest is
  teal; Training uses the primary hue; input borders at 3:1. Closes H9, A2.
- `maximumScale` removed; `touch-action: manipulation` on controls prevents double-tap zoom.
  Closes H10, A1.
- Root font size 17 px between 428 px and 767 px viewports, so text and targets grow on Pro Max
  and Plus phones. Everything is rem based.
- System font stack declared explicitly (the unused Geist variable is gone). Closes M22.
- `Button` `sm` and `icon-sm` sizes raised to 44 px; new `hero` size (52 px) and `tonal` variant.
  Closes M17, M26 for every screen that uses them.
- Page header wraps its actions under the title at large text instead of truncating.

### Shopping Mode

- Sticky counter bar anchors to the top of the viewport with the safe-area inset; the page header
  on that route no longer sticks. Counter reads "12 items remaining" and is a live region. Closes
  M12 and part of the Shopping polish.

### Verification

- `tsc`, `eslint`, 364 unit and integration tests, and both end-to-end Playwright journeys pass on
  a production build.
- Measured on the production build, seeded data, 430 × 932 (iPhone 14 Pro Max):

| Measurement | Before (390 px) | After (430 px) | After (390 px) |
| --- | --- | --- | --- |
| Today page height | 3,461 px (4.1 screens) | 1,882 px (2.0 screens) | 1,786 px (2.1 screens) |
| Bottom of "Mark eaten" from top | ≈ 1,537 px (1.8 screens down) | 582 px (above the fold) | 550 px |
| Bottom of the water buttons | just below the fold | 788 px (above the fold) | 744 px |
| Horizontal overflow at 320 px | none | none | none |
| Horizontal overflow at 160 % text | 401 px (yes) | none | — |

Captures of the rebuilt Today at 430 × 932 (light, dark, expanded row, day-state confirmation,
workout sheet) are in `docs/audit-screenshots/after-*.png`.

### Not in this slice

Groceries landing, Prep guided flow, Week view, Plan grouping, Settings regrouping, the
confirmation sheet on the other screens, and queued offline writes. See the audit's phased plan.
