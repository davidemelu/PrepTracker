#!/bin/sh
# Schema entrypoint — runs once per deployment, then exits.
#
# Order matters and each step exists for a reason:
#
#   1. Wait for Postgres.
#   2. Ask whether the database already holds data, and whether any migration is
#      pending.
#   3. If both are true, refuse unless a recent dump exists. A migration is the
#      only routine operation that can destroy history, and "back up first" was
#      previously a sentence in the documentation rather than something the
#      deployment enforced.
#   4. Apply migrations.
#   5. Seed only when the database was empty, so an upgrade never overwrites
#      edits made in the app.
#
# The app container waits for this one to exit 0, so anything that fails here
# stops the deployment rather than producing an app running against a schema it
# does not understand.
#
# Two extra commands exist for the runbook, because this is the only container
# with a Prisma CLI in it:
#
#   docker compose run --rm migrate status   what has and has not been applied
#   docker compose run --rm migrate seed     re-run the seed (it is idempotent:
#                                            it upserts reference data and never
#                                            touches your plan or history)

set -eu

PRISMA="/app/node_modules/prisma/build/index.js"

BACKUP_DIR=${BACKUP_DIR:-/backups}
# Two nights, so one missed nightly run does not block an upgrade, and a dump
# taken before yesterday's changes never counts as protection.
BACKUP_MAX_AGE_HOURS=${BACKUP_MAX_AGE_HOURS:-48}

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL is not set." >&2
  exit 1
fi

# libpq rejects Prisma's own query parameters (`?schema=public`), so psql and
# pg_isready get the bare connection URI.
PROBE_URI=${DATABASE_URL%%\?*}

# --- 1. wait for the database ----------------------------------------------

echo "PrepTracker/migrate: waiting for the database…"
attempt=0
until pg_isready -q -d "$PROBE_URI"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "FATAL: the database did not accept connections after 60 attempts." >&2
    exit 1
  fi
  sleep 1
done

case "${1:-deploy}" in
  deploy) ;;
  status)
    exec node "$PRISMA" migrate status
    ;;
  seed)
    echo "PrepTracker/migrate: running the seed…"
    exec node /app/seed.cjs
    ;;
  *)
    echo "FATAL: unknown command: $1 (expected deploy, status or seed)" >&2
    exit 64
    ;;
esac

# --- 2. does it already hold data, and is anything pending? -----------------

# Two plain queries rather than a Prisma client call, so this container needs no
# generated client, and — unlike the probe this replaces — a connection or
# permission error is fatal instead of being read as "empty, go ahead and seed".
# Two, not one: Postgres resolves every relation in a statement at parse time,
# so a single CASE over to_regclass still fails when the table is absent.
HAS_DATA=0
USERS_TABLE=$(psql -Atq -v ON_ERROR_STOP=1 -d "$PROBE_URI" -c \
  "SELECT to_regclass('public.users') IS NOT NULL")

if [ "$USERS_TABLE" = "t" ]; then
  USER_COUNT=$(psql -Atq -v ON_ERROR_STOP=1 -d "$PROBE_URI" -c 'SELECT count(*) FROM public.users')
  if [ "$USER_COUNT" -gt 0 ]; then
    HAS_DATA=1
  fi
fi

set +e
STATUS_OUTPUT=$(node "$PRISMA" migrate status 2>&1)
set -e
echo "$STATUS_OUTPUT"

if echo "$STATUS_OUTPUT" | grep -q 'Database schema is up to date'; then
  PENDING=0
else
  PENDING=1
fi

# --- 3. the backup gate -----------------------------------------------------

if [ "$PENDING" -eq 1 ] && [ "$HAS_DATA" -eq 1 ]; then
  MAX_AGE_MINUTES=$((BACKUP_MAX_AGE_HOURS * 60))
  RECENT_DUMP=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.sql.gz' \
    -mmin -"$MAX_AGE_MINUTES" 2>/dev/null | head -n 1)

  if [ -n "$RECENT_DUMP" ]; then
    echo "PrepTracker/migrate: recent dump found ($RECENT_DUMP); proceeding."
  elif [ "${SKIP_BACKUP_GATE:-0}" = "1" ]; then
    echo "PrepTracker/migrate: WARNING — migrations are pending and no dump newer"
    echo "  than ${BACKUP_MAX_AGE_HOURS}h exists in ${BACKUP_DIR}. SKIP_BACKUP_GATE=1 is set, so"
    echo "  this migration is running unprotected. If it goes wrong there is"
    echo "  nothing to restore from."
  else
    cat >&2 <<EOF
FATAL: refusing to migrate a database that has data without a recent backup.

  Pending migrations:  yes
  Dump newer than ${BACKUP_MAX_AGE_HOURS}h in ${BACKUP_DIR}:  none

Take one now, then start again:

  docker compose run --rm backup now
  docker compose up -d

Or, if you have a dump somewhere this container cannot see and you accept the
risk, override the gate for this run:

  SKIP_BACKUP_GATE=1 docker compose up -d
EOF
    exit 1
  fi
fi

# --- 4. migrate -------------------------------------------------------------

echo "PrepTracker/migrate: applying migrations…"
node "$PRISMA" migrate deploy

# --- 5. seed, only when the database was empty ------------------------------

if [ "$HAS_DATA" -eq 0 ]; then
  echo "PrepTracker/migrate: empty database, seeding initial data…"
  node /app/seed.cjs
else
  echo "PrepTracker/migrate: database already has data, skipping the seed."
fi

echo "PrepTracker/migrate: done."
