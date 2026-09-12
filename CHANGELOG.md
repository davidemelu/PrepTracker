# Changelog

All notable changes to PrepTracker are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the version is `0.x`,
breaking changes bump the minor number. The criteria for reaching `1.0.0` are in
[docs/REMEDIATION_PLAN.md](docs/REMEDIATION_PLAN.md#54-production-ready-criteria-for-v100).

## [Unreleased]

### Added

- Engineering audit ([docs/ENGINEERING_AUDIT.md](docs/ENGINEERING_AUDIT.md)) and phased
  remediation plan ([docs/REMEDIATION_PLAN.md](docs/REMEDIATION_PLAN.md)).
- Git workflow, commit convention and release process
  ([docs/COMMIT_GUIDE.md](docs/COMMIT_GUIDE.md)) and a pull-request template.

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
