## What changed

<!-- One paragraph. A reader who has not seen the branch should understand the change. -->

## Why

<!-- The problem or the request, and why this approach. Link the issue if there is one. -->

## How it was tested

<!-- Which of these ran, and anything checked by hand. -->

- [ ] `npm run verify` (lint, typecheck, unit, integration)
- [ ] `npm run test:e2e`
- [ ] Checked on a phone or at 320 px and 430 px in the browser, light and dark
- [ ] Manual steps:

## Screenshots

<!-- Required when the UI changed. Before/after at 430 px. Delete this section otherwise. -->

## Database migration

- [ ] None
- [ ] Yes: `prisma/migrations/<name>` — additive only
- [ ] Yes, with data migration or a column drop — rollback plan:

## Breaking change

- [ ] None
- [ ] Yes — what breaks and what the upgrade note says:

## Security and privacy impact

- [ ] None
- [ ] Touches auth, session, validation, backup/restore, file handling, or what is logged:

## Data integrity

- [ ] Does not write to journal tables (`daily_*`, `*_completions`, `water_entries`, `cooking_yields`)
- [ ] Writes to journal tables — explain why history stays correct:

## Test coverage

<!-- New domain logic must have unit tests. Say what is covered and what is deliberately not. -->

## Checklist

- [ ] Commits follow `docs/COMMIT_GUIDE.md`
- [ ] `CHANGELOG.md` → Unreleased updated
- [ ] Docs updated (`README.md`, `docs/*`) if behaviour, config or deployment changed
