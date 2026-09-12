# Changelog

All notable changes to PrepTracker are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is `0.x`,
breaking changes bump the minor number. The criteria for reaching `1.0.0` are in
[docs/REMEDIATION_PLAN.md](docs/REMEDIATION_PLAN.md#54-production-ready-criteria-for-v100).

## [Unreleased]

### Fixed

- **Rebuilding a day no longer rewrites it.** The rebuild deleted every meal and supplement
  row for the date and recreated them from the current plan, so a meal already eaten was
  re-portioned, a meal the new day type excluded disappeared, and the completion audit went
  with them — while the message said completions were kept. Rebuilding now reconciles row by
  row and never touches a row that carries a recorded action. Past days cannot be rebuilt.
- **Prep told the cook the wrong raw weight.** Where a food is planned both cooked and raw,
  the batch instruction used the shopping total instead of the raw weight for the cooked
  target.
- A quantity that is not a real number produced 0 kcal rather than "unknown", and was
  snapshotted into the day as if it were a measurement.
- "Moved to the fridge" and the yield history stamped the UTC date, which is tomorrow for
  anything logged after four in the afternoon in Pacific time.
- A new water target could be applied to any date the client named, moving the adherence
  already recorded against it.
- Supplements were never netted against what is already in the cupboard.
- Adherence counted today from the moment it was generated, so a week looked worse the
  earlier in the day it was read.
- "Overdue" and the yield average were each defined twice, with different answers.
- A server action that could not reach the server replaced the screen with the framework's
  error page. It now says nothing was saved and leaves the page standing.
- Every mutation fetched the page twice, because the client refreshed a route the action had
  already re-rendered in the same response.
- The service worker served a cached page silently when the home server was unreachable, and
  handed live tabs to a worker from a newer build.

### Security

- A backup file is validated column by column before anything is written, and every row it
  restores is re-owned to the account doing the restore.
- A password change now ends every other session.
- scrypt uses, and stores, the parameters it claims to; old hashes are upgraded on sign-in.
- Login attempts are throttled per username and per address.
- The post-sign-in redirect cannot be pointed off-site, and the published example secret is
  refused at startup.
- Server error text, including Prisma query arguments, no longer reaches the browser or the
  logs.
- Three actions verified ids supplied by the client that they previously took on trust.

### Added

- Engineering audit ([docs/ENGINEERING_AUDIT.md](docs/ENGINEERING_AUDIT.md)) and phased
  remediation plan ([docs/REMEDIATION_PLAN.md](docs/REMEDIATION_PLAN.md)).
- Git workflow, commit convention and release process
  ([docs/COMMIT_GUIDE.md](docs/COMMIT_GUIDE.md)) and a pull-request template.
- Route error boundaries and not-found pages, so a failure keeps its navigation.
- A banner that says when a page is a cached copy and how old it is, with a retry.
- 58 more automated tests, including two end-to-end journeys for a failed save and the
  narrowest phone.

### Changed

- Twenty-two foreign keys are indexed; the completion logs and plan ingredients are
  `Restrict` rather than `Cascade`, so deleting a food the plan uses names the meals first.
- `middleware.ts` is `proxy.ts`, following the Next 16 convention.
- The version is `0.1.0` rather than `1.0.0`; see the note under that heading.

## [0.1.0] - 2026-09-12

The first tagged release. Everything below was built before the project was versioned; it is
recorded here as the baseline rather than as a change.

### Added

- **Today** — one screen for the day: day type, workout, meals with quantities and times,
  water, supplements and progress. Meals can be completed, skipped, rescheduled, substituted
  and adjusted for the day only.
- **Plan** — full editor for meals, ingredients, units, cooked-vs-raw state, per-day-type
  quantities, substitution groups, supplements, the weekly training pattern and meal timing.
  No plan data lives in source code.
- **Meal timing** — times generated per day from the first meal, the workout anchors and the
  last-meal window, with the pre-workout gap following what is being trained.
- **Prep** — cook targets per food, raw weights from measured cooking yields, batches guided
  through weigh, cook and store, and portions split between fridge and freezer.
- **Groceries** — list generated from the plan with aggregation across meals and day types,
  cooked-to-raw conversion, inventory subtraction and package estimates, plus an in-store
  Shopping Mode grouped by department.
- **History and analytics** — weekly adherence, water trends, most-missed meal, supplement
  adherence and measured yield per protein.
- **Data** — full JSON backup that restores exactly, seven CSV extracts, and CLI backup and
  restore scripts.
- Self-hosted deployment: multi-stage Docker image running as a non-root user, Postgres 16,
  automatic migrations on start, and a seed that runs only on an empty database.
- Progressive Web App: installable, offline-readable pages, hand-written service worker.
- 240 unit tests, 124 integration tests against a real Postgres, and two end-to-end journeys.

[Unreleased]: https://github.com/davidemelu/PrepTracker/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/davidemelu/PrepTracker/releases/tag/v0.1.0
