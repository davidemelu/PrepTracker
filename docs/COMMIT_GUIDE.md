# Commit and branch guide

How changes reach `main`. Written for a single maintainer who wants the history to stay
reviewable and reversible, without ceremony that only pays off for a large team.

---

## Branch model

Trunk-based with short-lived feature branches. No `develop` branch, no GitFlow.

```
main                 always deployable; every commit on it has passed CI
 └─ feature/...      one change, a few days at most, merged through a pull request
```

`main` is what the home server runs. If it is on `main`, it must build, migrate and pass
the test suite.

### Branch names

`<type>/<short-kebab-description>`

| Prefix | Use for |
| --- | --- |
| `feature/` | new behaviour: `feature/grocery-generator`, `feature/meal-editor` |
| `fix/` | a defect: `fix/water-entry-validation` |
| `refactor/` | no behaviour change: `refactor/domain-services` |
| `docs/` | documentation only: `docs/deployment-guide` |
| `chore/` | tooling, dependencies, CI: `chore/dependabot` |
| `test/` | tests only: `test/yield-edge-cases` |

Keep a branch to one topic. If a redesign has five screens, that is five branches and five
pull requests, each mergeable on its own. The current `feature/ux-redesign` branch (13 commits,
2,000-line commits) is the shape to avoid.

---

## Commit messages

[Conventional Commits](https://www.conventionalcommits.org/) 1.0. The repository already
follows this style; this makes it a rule.

```
<type>(<scope>): <summary in the imperative, lower case, no full stop>

<body: what was wrong, what changed, why this way. Wrap at 72.>

<footer: BREAKING CHANGE:, Refs:, Migration:>
```

### Types

| Type | Meaning | Bumps |
| --- | --- | --- |
| `feat` | user-visible behaviour added or changed | minor |
| `fix` | a defect corrected | patch |
| `refactor` | code change with no behaviour change | – |
| `perf` | measurable performance improvement | patch |
| `test` | tests added or corrected | – |
| `docs` | documentation only | – |
| `build` | build system, Dockerfile, dependencies | – |
| `ci` | CI configuration | – |
| `chore` | anything else that is not source or tests | – |

`BREAKING CHANGE:` in the footer, or `!` after the type, bumps major once the project is at
1.0. Before 1.0 it bumps minor.

### Scopes

Use the feature area, matching the directory names under `src/components` and
`src/lib/actions`:

`today`, `plan`, `meals`, `foods`, `groups`, `supplements`, `schedule`, `timing`, `workout`,
`prep`, `storage`, `yield`, `groceries`, `shopping`, `inventory`, `water`, `history`,
`analytics`, `settings`, `backup`, `auth`, `db`, `pwa`, `ui`, `deploy`, `docker`

### Examples

```
feat(meals): add editable rest-day quantities
fix(grocery): prevent duplicate ingredient totals
test(yield): add cooked-to-raw conversion edge cases
docs(deploy): document Tailscale home-lab setup
refactor(day): move regeneration into day-service
build(docker): run migrations from a one-shot service
ci: run lint, typecheck, unit and integration on pull requests
fix(backup)!: reject files whose version is newer than the app

BREAKING CHANGE: backups written by 2.x no longer restore into 1.x.
```

### What a good body says

1. What was wrong or missing, in one or two sentences a future reader can verify.
2. What changed.
3. Why this approach and not the obvious alternative, if there was one.
4. `Migration:` when `prisma/migrations` changed, with the migration name.

The bodies in the existing history are a good model. Keep them.

### Sizes

- One logical change per commit. A commit that touches a migration, a domain module and its
  test is one change. A commit that rebuilds a screen and also adds a server action for another
  screen is two.
- Aim for under 400 changed lines. Above 800, split it, or explain in the body why it cannot be.
- Every commit should build and pass `npm run verify`. `git bisect` depends on it.
- Screenshots and other binaries go in their own `docs:` commit so the code diff stays
  reviewable, and are optimised first (`pngquant` or similar; keep each under 200 KB).

### Never

- `fix`, `wip`, `stuff`, `update`, `changes` with no scope or body.
- Commit `.env`, backups, `node_modules`, `.next`, `src/generated`.
- Amend or rebase anything already on `main`.

---

## Pull requests

Every change to `main` goes through a pull request, even when you are the only reviewer. The
point is the checklist and the CI run, not the approval.

1. Branch from `main`. Rebase on `main` before opening the PR so the diff is only your change.
2. Fill in `.github/pull_request_template.md`. Every question has an answer, even if it is
   "none".
3. CI must be green: lint, format, typecheck, unit, integration, build.
4. Self-review the diff in the GitHub UI. Reading it in a different tool catches things the
   editor did not.
5. **Squash-merge** when the branch commits are noise (`wip`, `fix lint`). **Rebase-merge** when
   each commit is a clean, self-contained step worth keeping. Never merge-commit; it makes
   `bisect` and `revert` harder for no benefit at this scale.
6. Delete the branch after merge.

### Review checklist

Before merging, confirm:

- [ ] The change is scoped to the branch's stated purpose.
- [ ] New or changed calculations live in `src/lib/domain` and have a unit test.
- [ ] Any new server action calls `requireUserId` and scopes every query by `userId`.
- [ ] Any Prisma write that touches more than one table is in a transaction.
- [ ] Journal tables (`daily_*`, `meal_completions`, `supplement_completions`, `water_entries`,
      `cooking_yields`) are not deleted or rewritten except through a deliberate, confirmed
      user action.
- [ ] Migrations are additive, or the body explains the data migration and the rollback.
- [ ] UI changes were checked at 320 px and 430 px, in light and dark.
- [ ] No secret, no personal data, no binary over 200 KB.
- [ ] `docs/` updated when behaviour, configuration or deployment changed.

---

## Releases

Semantic versioning, tagged on `main`.

- `0.y.z` until the production-ready criteria in `docs/REMEDIATION_PLAN.md` are met. Minor
  bumps for features, patch for fixes. Breaking changes are allowed but recorded.
- `1.0.0` when the app is deployed on the home server from a tagged image, with automated,
  restore-tested backups, and CI gating `main`.

Cutting a release:

```bash
git checkout main && git pull
# update CHANGELOG.md: move Unreleased into a new version heading
npm version minor --no-git-tag-version         # or patch / major
git commit -am "chore(release): v0.3.0"
git tag -a v0.3.0 -m "v0.3.0"
git push origin main --tags
```

The Docker image is built from the tag (`docker build -t preptracker:v0.3.0 .`) so the
running version is always traceable to a commit.

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/): `Added`, `Changed`,
`Fixed`, `Removed`, `Security`, with an `Unreleased` section that every PR appends to.
