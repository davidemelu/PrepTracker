#!/bin/sh
# Application entrypoint.
#
# Deliberately does almost nothing. Migrations and seeding now belong to the
# one-shot `migrate` service, which Compose runs to completion before this
# container starts (depends_on: condition: service_completed_successfully). That
# is what lets the runtime image ship without the Prisma CLI, and it means a
# failed migration stops the deployment instead of crash-looping a half-started
# app against a schema it does not understand.
#
# What is left is the check that used to be buried in the middle of all that:
# refuse to start at all rather than start and fail on the first request.

set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL is not set." >&2
  exit 1
fi

if [ -z "${AUTH_SECRET:-}" ]; then
  echo "FATAL: AUTH_SECRET is not set. Generate one with: openssl rand -base64 32" >&2
  exit 1
fi

echo "PrepTracker: starting on port ${PORT:-3000} (TZ=${TZ:-UTC}, $(date))"
exec "$@"
