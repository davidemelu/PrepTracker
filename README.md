# PrepTracker

A self-hosted, mobile-first app for meal planning, meal prep, supplements, hydration, groceries and daily adherence.

It is built to answer one question well, on a phone, without typing: **what do I need to eat, prep and buy — and am I actually doing it?**

```
Today            Plan              Prep              Groceries
─────────────    ─────────────     ─────────────     ─────────────
what to eat      edit the plan     what to cook      what to buy
when to eat it   day types         raw → cooked      raw amounts
water            substitutions     portions          shopping mode
supplements      meal times        fridge/freezer    departments
```

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Technology](#technology)
- [Local development](#local-development)
- [Database](#database)
- [Environment variables](#environment-variables)
- [Docker deployment](#docker-deployment)
- [Installing it on your phone](#installing-it-on-your-phone)
- [Home-lab deployment and security](#home-lab-deployment-and-security)
- [Backup and restore](#backup-and-restore)
- [Updating](#updating)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Design decisions worth knowing](#design-decisions-worth-knowing)

---

## What it does

**Today** — one screen that tells you the whole day: training or rest, meals with
quantities and times, what is next and how long until it, water, supplements, and an
overall completion percentage. Meals are large cards you can complete, skip,
reschedule, substitute, or adjust for today only.

**Training days and workouts** — each day is a Training or Rest day, set by a weekly
pattern and overridable on the day itself. The day type drives the meal portions
straight from your plan's per-day-type quantities. On a training day you record what you
trained — any number of body parts, plus an optional session name like "Upper A" — and
it shows at the top of Today and across the weekly view. Rest days hide the workout
inputs entirely.

**Planned vs actual meal times** — every meal keeps both. Marking one eaten stamps the
time from the clock; you can correct it afterwards if you logged it late. The planned
time is never overwritten.

**Meal times that follow your workout** — the day is built from the points that are
actually fixed, and everything else is spread evenly between them. The fixed points are
your first meal, the pre-workout meal a set time before training, the meal after
training finishes, and the last meal inside an evening window (9–11pm by default).
Meals in between land wherever the spacing works out, inside a range you set rather
than on one rigid interval — 3 to 4 hours, say.

Gym time varies, so it is a property of the *day*, not a global setting. Tap the
workout card on Today, set when you are actually training, and the whole day re-times
around it: training at 15:00 and training at 20:00 both give an evenly paced day
instead of a tidy morning and one enormous hole. Your usual time stays untouched, and
only that date changes. Any workout focus can also ask for a longer pre-workout gap
than the default — a leg day, typically — and a session takes the longest gap its
focuses ask for.

Where the arithmetic genuinely cannot work — five meals cannot cover 8am to an 8pm
session at four hours apart — the generator gets as close as it can and then says what
is left over and which end is pinned, rather than leaving a silent hole. Rest days have
nothing to eat around and simply spread across the day. Turn the whole thing off in
Plan → Meal timing to pin every meal to a fixed time instead.

**Plan** — a full editor. Meals, ingredients, units, cooked-vs-raw, per-day-type
quantities, substitution groups, supplements, the weekly training pattern, and a meal
time generator that places meals around your workout. **Nothing about your plan lives
in the source code** — it is all rows you can change.

**Prep** — tells you how much of each food to cook for the week, how much *raw* meat to
start with, then takes the weight that actually came off your scale and works out your
real cooking yield. That yield feeds straight back into next week's shopping list, so
the numbers get more accurate the more you cook.

**Groceries** — generates a list from the plan, aggregating the same food across meals
and day types, converting cooked weights to raw purchase weights, subtracting what is
already in your inventory, and estimating packages. Shopping Mode is a separate
in-store screen with oversized tap targets grouped by store department.

**Storage** — splits cooked portions between fridge and freezer and tells you what to
move down to thaw tonight.

**History and analytics** — weekly adherence, water trends, which meal you miss most,
supplement adherence, and measured cooking yield per protein.

**Your data** — a full JSON backup that restores exactly, plus CSV extracts.

---

## Architecture

### The two rules everything else follows

**1. The plan is data, never code.**
The seed writes rows. Every meal, ingredient, quantity, unit, time, day type,
substitution and yield is editable in the UI. Changing your diet never means changing
the application.

**2. History is immutable.**
Opening a day *materialises* it: the plan is copied into `daily_plans` /
`daily_meals` / `daily_meal_items` as a snapshot, including names, quantities, units
and macros. Editing the plan afterwards — even deleting a food outright — cannot
change what a past day says. Journal rows keep a nullable `SetNull` reference to the
definition plus their own copy of the values.

```
  definition tables          materialise           journal tables
  (mutable)                  ───────────►          (immutable snapshots)

  MealPlan, Meal,            once, when            DailyPlan, DailyMeal,
  MealIngredient,            you first             DailyMealItem,
  Food, DayType,             open a date           DailySupplement,
  Supplement                                       WaterEntry, DailyCheckIn
        │                                                  │
        │ edit freely                                      │ never rewritten
        ▼                                                  ▼
  affects FUTURE days only                   past days stay exactly as lived
```

### Layering

```
src/app/**            route segments — server components only
src/components/**     presentational components and client islands
src/lib/actions/**    server actions: auth → zod → domain → prisma → revalidate
src/lib/domain/**     PURE functions. No I/O, no Prisma, no React.   ← the tested core
src/lib/queries/**    read helpers (Prisma → view models)
src/lib/server/**     services that need both domain and database
src/lib/validation/** zod schemas shared by forms and actions
src/lib/auth/**       session, password hashing, guards
```

**`src/lib/domain` may not import Prisma, Next or React** — enforced by an ESLint rule.
Every calculation you care about being correct lives there and is unit-tested without a
database:

| Module | Responsibility |
| --- | --- |
| `units.ts` | unit registry, mass/volume/count conversion, formatting |
| `schedule.ts` | meal times: anchors around the workout, even spreading between them |
| `materialise.ts` | plan + day type → the concrete meals for a date |
| `yield.ts` | raw ↔ cooked, measured yield, portion counts |
| `grocery.ts` | expand N days, aggregate, subtract inventory, packages |
| `nutrition.ts` | per-item → meal → day macro rollups, nulls tolerated |
| `adherence.ts` | meal/supplement/water/overall percentages, weekly stats |
| `water.ts` | totals, remaining, duplicate-submission detection |
| `storage.ts` | fridge/freezer/thaw dates, "move tomorrow's meals" |
| `workout.ts` | formatting and validating what you trained, focus frequency, pre-workout gap |
| `reminders.ts` | due/overdue descriptors for everything |

Mutations are **server actions**, not a REST API: one UI consumes each, so validation,
authorisation and cache revalidation live together. Two HTTP routes remain because
non-React clients need them — `/api/export/*` (file downloads) and `/api/health`
(container healthcheck).

---

## Technology

| | |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript 5.9, strict |
| Styling | Tailwind CSS v4, shadcn-style components on Radix primitives |
| Database | PostgreSQL 16 |
| ORM | Prisma 7 (query compiler + `@prisma/adapter-pg`) |
| Validation | Zod 4 |
| Charts | Recharts 3 |
| Auth | Local username/password — scrypt (`node:crypto`) + a `jose`-signed cookie |
| Tests | Vitest (unit + integration), Playwright (end-to-end) |
| PWA | Hand-written service worker, Web App Manifest |

No third-party identity provider, no analytics, no outbound network calls at runtime.

---

## Local development

**Prerequisites:** Node 20.11+ (22 recommended) and Docker for the database.

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#    Set AUTH_SECRET to something long:  openssl rand -base64 32
#    Set TZ to your timezone, e.g. Europe/London

# 3. Start Postgres (listens on 5433 so it cannot clash with a local 5432)
docker compose -f docker-compose.dev.yml up -d

# 4. Create the schema and seed the starting plan
npm run db:migrate
npm run db:seed

# 5. Run it
npm run dev
```

Open <http://localhost:3001> and sign in with **`admin` / `preptracker`**. You will be
prompted to change the password.

> **Dev runs on 3001, the Docker container on 3000 — on purpose.** They use different
> databases, so sharing a port means the address you happen to type decides which
> data you see. Keep them apart.

### Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server on port 3001 |
| `npm run build` | Production build (generates the Prisma client first) |
| `npm start` | Run the production build |
| `npm run verify` | Lint, typecheck and all tests — run this before committing |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit + integration tests |
| `npm run test:unit` | Unit tests only (no database needed) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:migrate` | Create and apply a migration |
| `npm run db:deploy` | Apply existing migrations (production) |
| `npm run db:seed` | Seed the starting plan |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Drop, re-migrate and re-seed (destroys data) |
| `npm run backup` | Write a JSON backup to `./backups` |
| `npm run restore -- <file>` | Restore a JSON backup |

---

## Database

35 tables in four families:

- **Definition** (mutable) — `MealPlan`, `Meal`, `MealDayTypeSetting`, `MealIngredient`,
  `MealIngredientQuantity`, `Food`, `FoodOptionGroup`, `FoodOptionGroupMember`,
  `PlanWeekPreference`, `DayType`, `ScheduleDay`, `ScheduleDayFocus`, `WorkoutFocus`,
  `Supplement`, `SupplementSchedule`, `Settings`, `AppSetting`
- **Journal** (snapshots) — `DailyPlan`, `DailyMeal`, `DailyMealItem`, `MealCompletion`,
  `DailySupplement`, `SupplementCompletion`, `DailyWorkoutFocus`, `WaterEntry`,
  `DailyCheckIn`
- **Operations** — `GroceryWeek`, `GroceryItem`, `InventoryItem`, `PrepSession`,
  `PrepTask`, `PrepBatch`, `StoragePortion`, `CookingYield`
- **Identity** — `User`

Two design details worth knowing:

**Quantities are keyed by day type, not by column.** `MealIngredientQuantity` is
`(ingredient, dayType) → quantity`, so adding a "Light training" or "Refeed" day type
works without a migration. Rest-day Meal 5 rice is stored as a real ingredient with
quantity `0`, so switching the day back to Training restores it.

**Yield history is append-only.** `Food.cookingYieldPct` is the current effective
value; `CookingYield` keeps every `DEFAULT`, `MANUAL` and `MEASURED` observation. A
measured batch rolls the food's yield to a mean of recent measurements, so one odd
batch cannot swing next week's shopping list.

### Migrations

```bash
npm run db:migrate           # dev: create + apply
npm run db:deploy            # production: apply only
```

Migrations live in `prisma/migrations/`. In Docker they are applied by a one-shot
`migrate` service that runs to completion before the app starts — see
[Docker deployment](#docker-deployment).

---

## Environment variables

Copy `.env.example` to `.env`. Required:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Signs the session cookie. 32+ characters. `openssl rand -base64 32` |

Docker Compose also uses:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` | `preptracker` | Database user |
| `POSTGRES_PASSWORD` | *(required)* | Database password |
| `POSTGRES_DB` | `preptracker` | Database name |
| `APP_BIND` | `127.0.0.1` | Host interface to bind. `0.0.0.0` exposes it to the LAN |
| `APP_PORT` | `3000` | Host port |
| `ADMIN_USERNAME` | `admin` | Account created by the seed |
| `ADMIN_PASSWORD` | *(empty)* | Empty means `preptracker`, and you are prompted to change it |
| `TZ` | `UTC` | Your timezone, so "today" flips at your midnight |
| `COOKIE_SECURE` | `false` | Set `true` only when served over HTTPS |
| `PREPTRACKER_TAG` | `latest` | Which image tag Compose runs |

The backup service takes `BACKUP_TIME`, `BACKUP_WEEKLY_DAY`, `BACKUP_RETENTION_DAYS`,
`BACKUP_SECONDARY_DIR`, `BACKUP_RSYNC_TARGET`, `BACKUP_AGE_RECIPIENT` and
`BACKUP_ALLOW_UNENCRYPTED`; migrations take `BACKUP_MAX_AGE_HOURS` and `SKIP_BACKUP_GATE`.
All have defaults and all are explained in `.env.example` and
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md#backups). The only one worth setting on day one is a
destination for the off-host copy.

---

## Docker deployment

```bash
cp .env.example .env
# Set AUTH_SECRET, POSTGRES_PASSWORD and TZ

mkdir -p backups && sudo chown -R 1001:1001 backups

docker compose up -d --build
docker compose logs -f app
```

Four services, each with one job:

| Service | Lifetime | What it does |
| --- | --- | --- |
| `db` | always | Postgres 16, never published to the host |
| `migrate` | one shot | applies migrations, seeds an empty database, then exits |
| `app` | always | the Next.js server, and nothing else |
| `backup` | always | nightly dump, weekly off-host copy, weekly restore check |

`app` starts only when `migrate` has exited 0, so a failed migration stops the
deployment instead of leaving the app running against a schema it does not
understand. The seed runs **only if the database is empty**, so restarting never
re-seeds and never overwrites data.

The app image is 290 MB and contains the Next.js standalone build and nothing
else — no Prisma CLI, no `npm`, no source, no `psql`. Schema work happens in the
`migrate` container instead:

```bash
docker compose run --rm migrate status   # what is applied, what is pending
docker compose run --rm migrate seed     # re-run the idempotent seed
```

It listens on `127.0.0.1:3000` by default — reachable from the Docker host and nowhere
else. See the next section before changing that.

```bash
docker compose ps            # status and health, including the backup service
docker compose logs -f app   # follow logs
docker compose down          # stop (the named volume keeps your data)
docker compose down -v       # stop AND DELETE the database volume
```

The two compose files use different project names (`preptracker` and
`preptracker-dev`), so `docker compose down` on one can never remove the other's
containers or volumes.

Full detail, including resource limits and the reverse-proxy options, is in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

---

## Installing it on your phone

PrepTracker is a Progressive Web App: installable, full-screen, with an icon.

1. Make the app reachable from your phone (see the next section).
2. Open the address in your phone's browser and sign in.

**iPhone (Safari):** Share → *Add to Home Screen*.
**Android (Chrome):** menu → *Install app* / *Add to Home screen*.

It then opens full-screen with no browser chrome, and shortcuts jump straight to Today,
Groceries or Prep.

**Offline:** pages you have already opened stay readable if the server becomes
unreachable — useful when the home network hiccups mid-supermarket. Anything you change
while offline is **not** saved; the app tells you rather than pretending it worked.

> iOS only allows installing a PWA over `https://` or from `localhost`. Over plain HTTP
> on your LAN, Safari will run the app but will not offer *Add to Home Screen*. Use
> Tailscale or a reverse proxy with HTTPS (below) if you want it installed on iPhone.

---

## Home-lab deployment and security

**PrepTracker is not designed to face the public internet.** It ships bound to
`127.0.0.1` on purpose. Pick one of these instead.

### Option A — LAN only (simplest)

```dotenv
# .env
APP_BIND="0.0.0.0"
```

```bash
docker compose up -d
```

Reach it at `http://<your-server-ip>:3000` from any device on your network.

- Anyone on your network can reach the login page. Use a real password.
- No HTTPS, so iOS will not offer to install it to the home screen.
- Do **not** port-forward this from your router.

### Option B — Tailscale (recommended)

A private network between your devices, with no ports open to the internet.

1. Install Tailscale on the server and on your phone.
2. Keep `APP_BIND="127.0.0.1"` and instead let Tailscale serve it:

```bash
tailscale serve --bg 3000
tailscale status            # shows the https://<machine>.<tailnet>.ts.net address
```

3. Set `COOKIE_SECURE="true"` in `.env` and restart, since Tailscale serves HTTPS.

You get a real HTTPS certificate, so the PWA installs properly on iPhone, and the app is
reachable from anywhere you are signed into Tailscale — without exposing anything.

### Option C — Reverse proxy with HTTPS

Keep `APP_BIND="127.0.0.1"` and put Caddy in front. A complete `Caddyfile`:

```caddy
preptracker.home.example.com {
    # Caddy obtains and renews the certificate automatically.
    reverse_proxy 127.0.0.1:3000

    # Optional second factor in front of the app's own login.
    # basic_auth {
    #     david <bcrypt-hash-from: caddy hash-password>
    # }

    header {
        Strict-Transport-Security "max-age=31536000;"
        X-Content-Type-Options "nosniff"
    }
}
```

Set `COOKIE_SECURE="true"` in `.env` and restart.

For a LAN-only hostname, use Caddy's internal CA (`tls internal`) or a DNS-01
certificate from your provider; a public HTTP-01 challenge needs port 80 reachable,
which defeats the point.

Nginx Proxy Manager works equally well: proxy host → `127.0.0.1:3000`, request a Let's
Encrypt certificate, enable *Websockets support*.

### Reaching the dev server from your phone

`next dev` blocks cross-origin requests for its own hot-reload resources, so opening it
from a phone needs the host allow-listed. Tailscale names, `*.local`, and the usual
private ranges are already covered; add anything else to `.env`:

```dotenv
DEV_ORIGINS="my-laptop.tail1234.ts.net,100.95.116.73"
```

For everyday use on your phone, run the **Docker build** rather than the dev server —
it is faster, it is the thing you actually deploy, and it will not invalidate your
session every time a file changes.

### Security checklist

- [ ] Change the default password on first sign-in
- [ ] `AUTH_SECRET` is a long random string, unique to this install
- [ ] `POSTGRES_PASSWORD` is not the example value
- [ ] `COOKIE_SECURE="true"` if you are serving HTTPS
- [ ] Postgres is never published to the host (it uses `expose`, not `ports`)
- [ ] No router port-forwarding to the app
- [ ] `docker compose ps` shows `backup` healthy
- [ ] A copy of the backups exists somewhere that is not this machine, encrypted
- [ ] `.env` is in a password manager — without it the data is restorable but the
      installation is not

What this does and does not defend against, written out honestly, is in
[SECURITY.md](SECURITY.md).

---

## Backup and restore

> **A backup is a credential.** Both the JSON export and the Postgres dump contain
> `users.passwordHash` and every meal, supplement, water and check-in row you have
> recorded. Store one the way you store the database itself.

### 0. What runs by itself

The `backup` service is part of the deployment — there is no cron entry on the host
to forget, and nothing to re-create when the server is rebuilt.

- **Nightly** at 03:15 local: `pg_dump | gzip` into `./backups`, keeping 30 days.
- **Weekly:** restore the newest dump into a scratch database and count rows, so a
  backup that would not actually restore is found before you need it.
- **Weekly:** encrypt the newest dump with `age` and copy it off this machine.
- **On a pending migration:** refuse to migrate a database that has data unless a
  dump from the last 48 hours exists (`SKIP_BACKUP_GATE=1` overrides).

```bash
docker compose ps backup             # healthy = a dump within the last 36 hours
cat backups/.backup-status           # last dump, last verification, last copy
docker compose run --rm backup now   # take one immediately
```

The off-host copy needs one piece of setup — a second location and an `age` key —
and until you do it the service warns on every start that every backup is on the same
disk as the database. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) § *Backups* has the
steps; [docs/DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md) is what to do when you
need them.

### 1. From the app

**More → Backup & export → Download a full JSON backup.** Restores exactly, including
history. CSV extracts are there too, for meals, water, supplements, groceries, prep
batches, yields and inventory.

### 2. From the command line

```bash
npm run backup                                  # writes ./backups/preptracker-<user>-<timestamp>.json
npm run restore -- ./backups/preptracker-admin-2026-09-11T10-00-00.json
```

Restore is destructive and asks you to type `REPLACE` first (`--yes` skips the prompt).

Restoring a backup into a **fresh install** also restores that backup's account, ids
included. You will be signed out and should sign back in with the password that account
had when the backup was taken.

### 3. A Postgres dump (the belt-and-braces option)

This is what the `backup` service writes every night. By hand:

```bash
# Back up
docker compose run --rm backup now

# Restore, over the top of the live database
gunzip -c backups/db-2026-09-11.sql.gz | \
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U preptracker -d preptracker
```

`./backups` is mounted read-write into the `backup` service and read-only into `db`.
It is deliberately **not** mounted into `app`: the process reachable from the network
has no reason to be able to read every historical dump.

---

## Updating

```bash
cd /srv/preptracker

# 1. Back up first. The migrate service will refuse to run a pending migration
#    without a recent dump, but take one deliberately anyway.
docker compose run --rm backup now

# 2. Get the new version. Prefer a tag over the tip of main: it is what CI built
#    and scanned, and it is what a rollback goes back to.
git fetch --tags
git checkout v0.2.0

# 3. Rebuild and restart. The migrate service applies migrations and exits before
#    the app starts.
docker compose up -d --build

# 4. Check it came up
docker compose logs migrate
docker compose logs -f app
curl -s http://127.0.0.1:3000/api/health
```

If `migrate` exits non-zero the app does not start and the previous container keeps
running. Read `docker compose logs migrate`; the two usual causes are the backup gate
and a migration that genuinely failed.

To roll back: `git checkout <previous tag>`, rebuild, and restore the pre-upgrade dump
if a migration has already changed the schema. Step by step in
[docs/DISASTER_RECOVERY.md](docs/DISASTER_RECOVERY.md).

---

## Testing

```bash
npm run verify        # lint + typecheck + unit + integration
npm run test:unit     # pure domain logic, no database, ~200ms
npm test              # unit + integration (needs the dev database running)
npm run test:e2e      # full workflow in a real browser at phone size
```

| Layer | Where | What it covers |
| --- | --- | --- |
| Unit | `tests/unit` | Units and conversion, raw↔cooked yield, grocery aggregation, training/rest quantities, water, adherence, nutrition, scheduling, storage, reminders |
| Integration | `tests/integration` | Grocery generation, the prep and yield feedback loop, food validation and deletion — against a real Postgres |
| End-to-end | `tests/e2e` | Sign in → read the day → log water → complete a meal → take a supplement → generate groceries → shop → prep and weigh a batch → weekly tracker → history → backup. Plus: editing the plan does not rewrite a logged day |

Integration tests create their own `preptracker_test` database and E2E uses
`preptracker_e2e`, so neither can touch your real data. E2E runs against the same
standalone production server the Docker image runs.

First E2E run only:

```bash
npm run test:e2e:install   # downloads the browser
npm run build              # E2E runs the production build
npm run test:e2e
```

---

## Project structure

```
prisma/
  schema.prisma            35 models, heavily commented
  migrations/              applied by the one-shot `migrate` compose service
  seed.ts                  writes the starting plan as rows — never read at runtime
src/
  app/
    (app)/                 authenticated routes: today, plan, prep, groceries, more
    login/                 sign-in
    api/health             container healthcheck
    api/export/[kind]      JSON backup and CSV downloads
    manifest.ts            web app manifest
  components/
    ui/                    button, card, input, sheet, checkbox, progress…
    layout/                page header, bottom navigation
    today/ plan/ prep/ groceries/ more/
  lib/
    domain/                PURE, unit-tested logic — the core of the app
    actions/               server actions
    queries/               read models
    server/                services needing domain + database
    validation/            zod schemas
    auth/                  session, scrypt passwords, guards
  proxy.ts                 redirects signed-out requests to /login
docker/entrypoint.sh       wait for db → migrate → seed if empty → start
scripts/
  backup.ts restore.ts     CLI backup and restore
  generate-icons.mjs       regenerates the PWA icons
tests/
  unit/ integration/ e2e/
docs/
  ARCHITECTURE.md          the design, and why
  ASSUMPTIONS.md           every ambiguity and the assumption made
  DEPLOYMENT.md            home-lab specifics
```

---

## Design decisions worth knowing

**Server actions over a REST API.** Each mutation has exactly one caller. Keeping
validation, authorisation and revalidation together removes a whole class of
client/server drift.

**Native `<select>` on mobile.** iOS and Android render a full-screen picker that is far
easier to use one-handed than any custom dropdown, and it works without JavaScript.

**Bottom sheets, not separate pages.** Editing happens in a sheet anchored to the bottom
of the screen, so you never lose your place in a list.

**scrypt, not bcrypt.** `node:crypto` has scrypt built in, so there is no native module
to compile — the Docker image stays small and `npm install` never needs a toolchain.

**Unit conversion refuses rather than guesses.** Grams and millilitres never mix. When
inventory cannot be converted to a shopping unit, the list says so instead of
subtracting a wrong number — arriving home without dinner is worse than buying a spare
bag of rice.

**Nulls mean unknown, not zero.** A food with no nutrition entered contributes nothing
to a total *and* is listed as missing, so you can see how complete the number is.

**Skipped meals count against adherence.** Skipping is an honest record of not eating
something, not a way to remove it from the denominator.

**Water is capped at 100% per day.** One very heavy day cannot paper over three dry
ones.

**No medical advice anywhere.** Supplements are tracked as items you decided to take.
There is no dosage guidance, interaction checking or recommendation in the codebase.

---

## Licence

MIT — see [LICENSE](LICENSE). A personal project, published in case it is useful to
someone else; use it however you like, with no warranty of any kind.
