# Disaster recovery

A runbook, written to be followed at two in the morning by someone who is tired and
has not read the code for six months. Every step is a command you can paste. Where a
step is destructive it says so before the command, not after.

Companion to [DEPLOYMENT.md](DEPLOYMENT.md), which covers the normal case.

---

## Where you are

Every command here runs from the deployment directory — the folder holding
`docker-compose.yml`. **On this install that is the repository itself**,
`C:\Users\DavidEmelu\Documents\PrepTracker`, because it runs on Docker Desktop for
Windows where the working copy and the deployment are the same folder. On a Linux
host it is wherever you cloned, conventionally `/srv/preptracker`. Written below as
`$PREPTRACKER` where it has to be spelled out at all.

Docker Desktop also means **you never need `chown` on `./backups`** — the bind mount
does not enforce host ownership. On a Linux host you do; it is flagged at each point.

---

## Before anything else

```bash
cd "$PREPTRACKER"
docker compose ps
docker compose logs --tail=50 app
ls -lt backups | head
```

Those four lines answer "what is actually broken" most of the time. **Do not run
`docker compose down -v`.** It deletes the database volume, and it is the only
command in this document that loses data on its own.

If the data might be wrong rather than merely unreachable, take a dump of the
current state before you change anything. A dump of a damaged database is still
evidence, and it costs twenty seconds:

```bash
docker compose run --rm backup now
```

---

## What has to exist to rebuild completely

Four things. If all four survive, everything is recoverable. If any one is missing,
part of the system is not.

| | What | Where it should live | How to check it is there |
| --- | --- | --- | --- |
| 1 | **The code**, including `prisma/migrations` | the git remote, not only this machine | `git ls-remote --heads origin` |
| 2 | **`.env`** — `AUTH_SECRET`, `POSTGRES_PASSWORD`, `TZ` | a password manager, never git | open the password manager entry |
| 3 | **The newest dump** | `./backups`, and a copy off this machine | `ls -lt backups \| head -3` |
| 4 | **The age private key**, if the off-host copies are encrypted | the same password manager | `age-keygen -y backup-key.txt` prints the public key |

Without 1 you have data and nothing to run it in. Without 2 you have to reset the
password and every session is invalid. Without 3 you have an empty application.
Without 4 the off-host copies are unreadable, including by you.

**Realistic expectations.** The nightly dump runs at 03:15, so the most you can lose
is a day of edits: anything since the last dump is gone. A rebuild onto a working
host with Docker installed takes about twenty minutes, most of which is the image
build.

---

## 1. The server is dead — rebuild on a new host

Nothing on the old machine is needed if you have the four things above.

1. Install Docker and the Compose plugin on the new host, then:

   ```bash
   # Linux host:
   sudo mkdir -p /srv/preptracker && sudo chown "$USER" /srv/preptracker
   git clone <your-repo> /srv/preptracker
   cd /srv/preptracker

   # Docker Desktop (Windows or macOS): clone wherever you keep projects.
   # The working copy is the deployment.
   ```

2. Check out the version you were running, not `main`, so the schema matches the
   dump:

   ```bash
   git tag --list 'v*' | tail -5
   git checkout v0.1.0          # the tag the old server was on
   ```

3. Restore `.env` from the password manager. `AUTH_SECRET` and
   `POSTGRES_PASSWORD` must be the **same values as before**: a different
   `AUTH_SECRET` invalidates existing sessions (harmless, you sign in again), and a
   different `POSTGRES_PASSWORD` will not match the password baked into the restored
   database's role.

4. Put the newest dump in place. If it is the encrypted off-host copy:

   ```bash
   mkdir -p backups
   # Linux host only — Docker Desktop needs no chown:
   #   sudo chown -R 1001:1001 backups
   age -d -i backup-key.txt -o backups/db-restore.sql.gz db-2026-09-11.sql.gz.age
   ```

5. Start **only the database**, so nothing migrates or seeds over the top of the
   restore:

   ```bash
   docker compose up -d --build db
   docker compose ps db          # wait for (healthy)
   ```

6. Restore:

   ```bash
   gunzip -c backups/db-restore.sql.gz | \
     docker compose exec -T db psql -v ON_ERROR_STOP=1 -U preptracker -d preptracker
   ```

7. Bring up the rest. `migrate` will find a database that already has data, apply
   nothing (the tag matches the dump), and skip the seed:

   ```bash
   docker compose up -d
   docker compose logs migrate
   curl -s http://127.0.0.1:3000/api/health
   ```

8. Re-establish the route in: `tailscale up`, then `tailscale serve --bg 3000`. The
   MagicDNS name changes if the machine name changed, which means re-adding the PWA
   to the home screen.

9. Confirm the data is really there before you walk away — sign in, open Today, and
   open Analytics, which reads the oldest rows.

---

## 2. The database is corrupt — restore into a fresh volume

Symptoms: Postgres will not start, logs mention invalid pages or a failed checksum,
or queries fail in ways that do not look like application bugs.

> This deletes the current database volume. The dump becomes the only copy. Make
> sure step 1 succeeds before you run step 2.

1. Copy the newest dump somewhere off this directory, and check it is readable:

   ```bash
   cp backups/db-2026-09-11.sql.gz /tmp/restore.sql.gz
   gunzip -t /tmp/restore.sql.gz && echo "archive is intact"
   ```

2. Stop everything and delete the volume:

   ```bash
   docker compose down
   docker volume rm preptracker_db
   ```

3. Start a fresh, empty database and let it initialise:

   ```bash
   docker compose up -d db
   docker compose ps db          # wait for (healthy)
   ```

4. Restore into it:

   ```bash
   gunzip -c /tmp/restore.sql.gz | \
     docker compose exec -T db psql -v ON_ERROR_STOP=1 -U preptracker -d preptracker
   ```

5. Bring the stack up and check:

   ```bash
   docker compose up -d
   docker compose run --rm migrate status    # expect "Database schema is up to date!"
   curl -s http://127.0.0.1:3000/api/health
   ```

---

## 3. Something was deleted by accident

A food, a meal, a day, a plan. The database is healthy; one set of rows is wrong.
**Do not restore the whole dump over the live database** — that would throw away
everything done since the dump to recover one row.

1. Take a dump of the current state first. You are about to compare two versions and
   you will want to be able to get back to this one:

   ```bash
   docker compose run --rm backup now
   ```

2. Restore last night's dump into a scratch database, alongside the live one:

   ```bash
   docker compose exec -T db createdb -U preptracker rescue
   gunzip -c backups/db-2026-09-11.sql.gz | \
     docker compose exec -T db psql -q -U preptracker -d rescue
   ```

3. Find what you are missing:

   ```bash
   docker compose exec -T db psql -U preptracker -d rescue \
     -c "SELECT id, name FROM foods WHERE name ILIKE '%chicken%'"
   ```

4. Copy the rows across. `postgres_fdw` and `dblink` are not installed, so the
   simplest route is a dump of just those tables piped into the live database:

   ```bash
   docker compose exec -T db pg_dump -U preptracker -d rescue \
     --data-only --table=foods --column-inserts \
     | grep "INSERT INTO public.foods" \
     | grep -i chicken \
     | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U preptracker -d preptracker
   ```

   Rows that still exist will collide on the primary key and be rejected; that is the
   safe direction to fail in. If the row is referenced by others — a meal's
   ingredients, a day's items — restore the parents first, in this order: `foods` →
   `meals` → `meal_ingredients` → `meal_ingredient_quantities`.

5. Clean up:

   ```bash
   docker compose exec -T db dropdb -U preptracker rescue
   ```

**Alternative, when the whole account is wrong rather than a few rows:** the JSON
backup restores one user exactly, including history. From a checkout with
dependencies installed:

```bash
npm run restore -- ./backups/preptracker-admin-2026-09-11T10-00-00.json
```

It is destructive by design — it replaces the account's data — and asks you to type
`REPLACE` first.

---

## 4. A migration failed half-way

Symptoms: `migrate` exits non-zero, `app` never starts, and the old app container is
still running against the old schema.

1. Find out what state the schema is in:

   ```bash
   docker compose logs migrate
   docker compose run --rm migrate status
   ```

2. **If the failed migration has not been applied at all** — status shows it as
   pending and the error was a connection or a gate refusal — fix the cause and run
   `docker compose up -d` again. Nothing is damaged.

3. **If it was applied partially** — status shows a failed migration — do not try to
   patch the schema by hand. Restore the pre-upgrade dump, which the gate made sure
   exists, and go back to the previous version:

   ```bash
   ls -lt backups | head -3
   docker compose down
   docker volume rm preptracker_db
   docker compose up -d db          # wait for (healthy)
   gunzip -c backups/db-<pre-upgrade>.sql.gz | \
     docker compose exec -T db psql -v ON_ERROR_STOP=1 -U preptracker -d preptracker

   git checkout v0.1.0              # the tag you were on before the upgrade
   docker compose up -d --build
   ```

4. Report it before trying the upgrade again: open an issue with the `migrate` log
   and the `migrate status` output. A migration that fails once on your data will
   fail again.

---

## 5. The deployment is broken but the data is fine

The app crashes, renders wrongly, or a release turned out to be bad. Nothing is
wrong with the database.

1. Go back to the last tag that worked:

   ```bash
   git tag --list 'v*' | tail -5
   git checkout v0.1.0
   docker compose up -d --build
   docker compose logs -f app
   ```

2. If that release also ran a migration, the old code may not understand the new
   schema. Prisma migrations in this project are additive, so the previous version
   usually runs fine against the newer schema — but if it does not, restore the
   pre-upgrade dump as in scenario 4.

3. If the image itself is suspect — a half-finished build, a corrupted layer —
   rebuild it from nothing:

   ```bash
   docker compose build --no-cache app
   docker compose up -d
   ```

---

## 6. The phone is lost or stolen

Nothing of value lives on the phone. The PWA is a browser tab: no data is stored in
it beyond a cached copy of the last screens it showed, and the session cookie.

1. Sign in on another device and change your password (**More → Account**). That
   bumps the account's session version, which invalidates every session issued
   before it — including the one on the lost phone.

2. If you cannot sign in anywhere, rotate the signing key on the server instead.
   Every session everywhere stops verifying:

   ```bash
   cd "$PREPTRACKER"
   openssl rand -base64 32              # put this in .env as AUTH_SECRET
   docker compose up -d app
   ```

3. If the phone was on your tailnet, remove the device in the Tailscale admin
   console. That is the layer that gave it network access in the first place, and it
   is the one that matters most.

---

## 7. The Docker volume is gone or unusable

`docker volume ls` no longer lists `preptracker_db`, or Postgres starts against an
empty data directory and the app shows a fresh seeded plan.

> If the app has already started against an empty database it will have seeded it.
> Stop it now, before anything writes over the restore.

```bash
docker compose down
docker volume rm preptracker_db 2>/dev/null || true
docker compose up -d db               # wait for (healthy)
gunzip -c backups/db-<newest>.sql.gz | \
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U preptracker -d preptracker
docker compose up -d
```

The restore drops and recreates every object it owns (`pg_dump --clean
--if-exists`), so it is safe to run over a database that a seed has already
populated.

---

## 8. The backups themselves are the problem

The `backup` service is unhealthy, or a restore verification failed.

```bash
docker compose logs --tail=60 backup
cat backups/.backup-status
docker compose run --rm backup verify
```

- **`last_verify_result=fail`** — the newest dump does not restore. Verify an older
  one by hand, find the newest that does, and treat everything after it as
  unprotected until the cause is fixed.
- **`last_dump_result=fail`** — `pg_dump` cannot reach the database or cannot write
  to `./backups`. On a Linux host check `sudo chown -R 1001:1001 backups`; on Docker
  Desktop ownership is not the cause, so look at the database being unreachable or
  the disk being full.
- **`last_offsite_result=unconfigured`** — there is no copy anywhere but this
  machine. See [DEPLOYMENT.md](DEPLOYMENT.md) § *Getting a copy off the machine*.

To read an encrypted off-host copy:

```bash
age -d -i backup-key.txt -o db-2026-09-11.sql.gz db-2026-09-11.sql.gz.age
gunzip -t db-2026-09-11.sql.gz && echo "intact"
```

---

## Proving this works

A runbook nobody has followed is a guess. Exercise it once, on a spare machine or a
virtual machine, and record the result here.

| Date | Scenario | Host | Time taken | Outcome |
| --- | --- | --- | --- | --- |
| | 1. Rebuild on a new host | | | |
| | 2. Restore into a fresh volume | | | |
| | 4. Roll back a failed migration | | | |

The weekly restore verification in the `backup` service covers the narrow question
"does the newest dump restore and contain rows". It does not cover the questions
these three scenarios answer: whether `.env` is actually recoverable, whether the
tag you need is actually pushed, and whether you can find the age key.
