# Contributing

One maintainer, one deployment. The process is deliberately small.

- **Branches, commits and pull requests:** [docs/COMMIT_GUIDE.md](../docs/COMMIT_GUIDE.md).
- **What a pull request has to answer:** the [pull request template](pull_request_template.md).
- **Running it locally, tests, deployment:** [README.md](../README.md) and
  [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md).
- **Before you push:** `npm run verify` — lint, typecheck, unit and integration tests.
  CI runs the same, plus `npx prisma validate`, a check that the migrations and the
  schema agree, `npm run build`, `npm audit` and a Trivy scan of the image.

## Branch protection

Set once, in *Settings → Branches → Add rule* for `main`:

- Require a pull request before merging. **Do not require approvals** — there is one
  maintainer, and a rule that cannot be satisfied is a rule that gets bypassed.
- Require the status check **`Lint, types, schema, tests, build`** to pass.
- Require branches to be up to date before merging.
- Block force pushes and deletions.

`main` is what the home server runs. Everything above exists so that "it is on
`main`" means "it built, migrated and passed the tests".

---

## Screenshots in the repository

The pull request template asks for before/after screenshots whenever the UI changes,
and `docs/` is where they live. Uncompressed phone screenshots are 400–500 KB each
and git keeps every version of every one forever, so a few careless months of
screenshots outweigh the entire source tree. Three rules keep that from happening.

**Compress before committing.** A UI screenshot is flat colour and text, which
quantises to a palette with no visible loss:

```bash
pngquant --quality 60-80 --skip-if-larger --strip --ext .png --force docs/*.png
```

Typically 480 KB becomes 90 KB. Check it looks right before you commit; if the
compressed file is worse, `--skip-if-larger` has already left the original alone.

**Keep only the latest "after" set.** Screenshots document what the app looks like
now, not every step that got it there. When a screen is redesigned again, replace the
images rather than adding a second generation beside them — `git log` still has the
old ones if anybody ever wants them, and nobody ever does.

**Watch the size.** `docs/` is currently about 9 MB.

```bash
du -sh docs
```

If it passes 20 MB, move images to [Git LFS](https://git-lfs.com) before it gets
worse — a clone that drags 100 MB of superseded PNGs is a clone nobody makes on a
slow connection, and history cannot be trimmed after the fact without rewriting it.

Screenshots for a pull request discussion are different: paste them into the pull
request itself. GitHub stores those, not the repository, so they cost nothing and
they belong with the conversation rather than in `docs/`.
