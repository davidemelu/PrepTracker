#!/bin/sh
# Container entrypoint.
#
# Waits for Postgres, applies migrations, and seeds only when the database is
# empty — so an upgrade never overwrites data, and a first run is ready to use.

set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL is not set." >&2
  exit 1
fi

if [ -z "${AUTH_SECRET:-}" ]; then
  echo "FATAL: AUTH_SECRET is not set. Generate one with: openssl rand -base64 32" >&2
  exit 1
fi

# Readiness is "Postgres is accepting connections", nothing more. It must not
# be `prisma migrate status`: that command exits non-zero whenever migrations
# are *pending*, which is exactly the case on every upgrade, so using it here
# burned the full retry budget before each upgrade could start.
# libpq rejects Prisma's own query parameters (`?schema=public`), so the probe
# gets the bare connection URI.
PROBE_URI=${DATABASE_URL%%\?*}

echo "PrepTracker: waiting for the database…"
attempt=0
until pg_isready -q -d "$PROBE_URI"; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "FATAL: the database did not accept connections after 60 attempts." >&2
    exit 1
  fi
  sleep 1
done

echo "PrepTracker: applying migrations…"
npx --no-install prisma migrate deploy

# `prisma migrate status` returns non-zero for "no migrations applied" as well
# as for real errors, so the emptiness check is a direct query instead.
USER_COUNT=$(node -e "
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('./src/generated/prisma');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
prisma.user.count()
  .then((n) => { console.log(n); return prisma.\$disconnect(); })
  .catch(() => { console.log('0'); process.exit(0); });
" 2>/dev/null | tail -1)

if [ "${USER_COUNT:-0}" = "0" ]; then
  echo "PrepTracker: empty database, seeding initial data…"
  npx --no-install tsx prisma/seed.ts
else
  echo "PrepTracker: database already has data, skipping the seed."
fi

echo "PrepTracker: starting on port ${PORT:-3000}"
exec "$@"
