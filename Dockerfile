# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# PrepTracker images
#
# One Dockerfile, three shipped targets, because the three jobs need very
# different things installed:
#
#   runner   the long-running app. Next's standalone output only: no source, no
#            dev dependencies, no Prisma CLI, no build toolchain. This is the
#            image that runs for months, so it is the one worth keeping small.
#   migrate  a one-shot container that applies migrations and seeds an empty
#            database, then exits. It keeps the Prisma CLI, which the runtime
#            deliberately no longer carries.
#   backup   the nightly dump, the weekly off-host copy and the weekly restore
#            verification. Built on the Postgres image so pg_dump matches the
#            server version exactly.
#
# The app used to migrate and seed itself at boot, which meant shipping the
# Prisma CLI and tsx in the runtime image: 1.31 GB, of which 768 MB was a
# node_modules the running app never touched. Splitting the jobs is what makes
# the runtime image small, and it also means a failed migration stops the
# deployment instead of crash-looping a half-started app.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22-alpine
ARG POSTGRES_VERSION=16-alpine


# --- deps: everything needed to build --------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# Install scripts are needed here: Prisma downloads its engines in a postinstall.
RUN npm ci --ignore-scripts=false --no-audit --no-fund


# --- builder: Prisma client, Next build, compiled seed ----------------------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# prisma.config.ts resolves DATABASE_URL when it loads, so a placeholder has to
# be present even though nothing connects to a database during the build.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-time-placeholder-secret-value-000000"
ENV NEXT_TELEMETRY_DISABLED=1

# The client is generated from the schema, so it must exist before `next build`.
RUN npx prisma generate
RUN npx next build

# The trace always pulls in sharp's prebuilt binaries, because next/image could
# use them. This app renders no next/image anywhere — the only images it serves
# are the static PWA icons — so 27 MB of platform binaries go. Removed here
# rather than in the runtime stage: deleting a file in a later layer hides it
# without making the image any smaller.
RUN rm -rf .next/standalone/node_modules/@img .next/standalone/node_modules/sharp

# The seed is TypeScript and imports the generated client, so the container that
# runs it would otherwise need tsx and a node_modules. esbuild (already in the
# tree, via tsx and vitest) bundles it into one ~5 MB file with no dependencies,
# which is the whole reason the migrate image can stay lean.
RUN node_modules/.bin/esbuild prisma/seed.ts \
      --bundle \
      --platform=node \
      --target=node22 \
      --format=cjs \
      --external:pg-native \
      --outfile=dist/seed.cjs


# --- migrate: one-shot schema and seed --------------------------------------
FROM node:${NODE_VERSION} AS migrate
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# The CLI otherwise phones home for a version check on every deployment.
ENV CHECKPOINT_DISABLE=1

# psql and pg_isready: the entrypoint waits for the database and asks it whether
# it already holds data before deciding to seed. `apk upgrade` for the same reason
# as in the runtime stage below.
RUN apk upgrade --no-cache \
  && apk add --no-cache postgresql16-client tini tzdata

# Only the Prisma CLI, at exactly the version package-lock.json pins, rather than
# a second copy of the application's dependencies. Reading the version from the
# lock file means this cannot drift from the version the app was built against.
#
# It has to live in /app/node_modules rather than somewhere tidier, because
# prisma.config.ts imports `prisma/config`, which Node resolves relative to the
# config file.
COPY package-lock.json /tmp/package-lock.json
RUN PRISMA_VERSION="$(node -p "require('/tmp/package-lock.json').packages['node_modules/prisma'].version")" \
  && npm init -y > /dev/null \
  && npm install --no-audit --no-fund --ignore-scripts=false "prisma@${PRISMA_VERSION}" \
  && rm -rf /root/.npm /tmp/package-lock.json

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/dist/seed.cjs ./seed.cjs
COPY docker/migrate-entrypoint.sh /usr/local/bin/migrate-entrypoint.sh
RUN chmod +x /usr/local/bin/migrate-entrypoint.sh

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/migrate-entrypoint.sh"]
# `docker compose run --rm migrate status` and `… seed` override this.
CMD ["deploy"]


# --- backup: nightly dump, off-host copy, restore verification --------------
FROM postgres:${POSTGRES_VERSION} AS backup

# age encrypts the off-host copy; rsync and ssh carry it to another machine on
# the tailnet. tzdata is what makes the nightly time mean local time.
#
# No `apk upgrade` here, unlike the other two stages: this base pins its Postgres
# client packages to the exact version the server runs, and pg_dump matching the
# server is worth more than a patch release of a library this container only uses
# to talk to a database on its own compose network.
RUN apk add --no-cache age rsync openssh-client tini tzdata

# The container runs as a uid with no passwd entry, so anything that would look
# one up for a home directory (ssh, in particular) needs to be told where it is.
ENV HOME=/tmp

COPY docker/backup-entrypoint.sh /usr/local/bin/backup-entrypoint.sh
RUN chmod +x /usr/local/bin/backup-entrypoint.sh

# Runs as the app's uid, not root, so everything in ./backups has one owner and
# the container needs no capabilities at all. See docs/DEPLOYMENT.md.
USER 1001:1001

# Docker runs the first check one interval after start, so a long interval would
# leave `docker compose ps` saying "health: starting" for that long after every
# deployment. The check itself reads one small file, so two minutes costs nothing.
HEALTHCHECK --interval=2m --timeout=10s --start-period=5m --retries=2 \
  CMD ["/usr/local/bin/backup-entrypoint.sh", "check"]

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/backup-entrypoint.sh"]
CMD ["daemon"]


# --- runner: the image that actually runs the app ---------------------------
# Last stage on purpose, so a plain `docker build .` produces the app image.
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# tini gives correct signal handling for a clean shutdown; tzdata is what makes
# TZ="America/Los_Angeles" mean anything — without it Alpine silently falls back
# to UTC and every meal time is wrong by your UTC offset. Nothing else is
# installed: this container no longer migrates, seeds or dumps anything.
#
# `apk upgrade` picks up patch releases of the base image's own packages —
# openssl in particular — that the published node tag has not been rebuilt for.
# It only moves within the base image's Alpine release, so it cannot change the
# distribution underneath the app.
#
# npm, npx and yarn go: the container starts with `node server.js` and nothing
# in it ever installs a package. They are also where every Node advisory in this
# image comes from — tar, pacote, sigstore, brace-expansion and the rest all
# live in npm's own bundled dependencies, not in anything the app imports.
RUN apk upgrade --no-cache \
  && apk add --no-cache tini tzdata \
  && rm -rf /usr/local/lib/node_modules/npm \
       /usr/local/bin/npm /usr/local/bin/npx \
       /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs preptracker

# Next's standalone output: server.js, the compiled app, and the traced subset of
# node_modules it actually imports. The Prisma client is bundled into the server
# chunks by the build, so no generated client is copied separately.
COPY --from=builder --chown=preptracker:nodejs /app/.next/standalone ./
COPY --from=builder --chown=preptracker:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=preptracker:nodejs /app/public ./public

COPY --chown=preptracker:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER preptracker
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
