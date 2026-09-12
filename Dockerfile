# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# PrepTracker production image
#
# Four stages so the final image carries only what it needs to run: no source,
# no dev dependencies, no build toolchain. The runtime keeps a production-only
# node_modules because the container migrates and seeds the database on boot,
# which needs the real Prisma CLI rather than a hand-picked subset of files.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22-alpine

# --- deps: full install for the build ---------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# Install scripts are needed here: Prisma downloads its engines in a postinstall.
RUN npm ci --ignore-scripts=false --no-audit --no-fund

# --- prod-deps: what the runtime actually needs ------------------------------
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts=false --no-audit --no-fund

# Drop packages this container provably never executes. Each is a transitive
# dependency pulled in for tooling we do not run:
#   playwright-core, @electric-sql  -> only used by Prisma Studio / prisma dev
#   @img (sharp)                    -> only used by next/image, which this app
#                                      does not use anywhere
RUN rm -rf \
      node_modules/playwright-core \
      node_modules/@electric-sql \
      node_modules/@img \
      node_modules/.cache

# --- builder: generate the Prisma client and build Next ----------------------
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

# --- runner: the shipped image ----------------------------------------------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# postgresql-client makes `docker compose exec` backups possible from inside the
# app container; tini gives correct signal handling for a clean shutdown; tzdata
# is what makes TZ="America/Los_Angeles" mean anything — without it Alpine
# silently falls back to UTC and every meal time is wrong by your UTC offset.
RUN apk add --no-cache postgresql16-client tini tzdata \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs preptracker

COPY --from=prod-deps --chown=preptracker:nodejs /app/node_modules ./node_modules
COPY --chown=preptracker:nodejs package.json ./package.json

# Next's standalone bundle, plus the assets it does not inline.
COPY --from=builder --chown=preptracker:nodejs /app/.next/standalone ./
COPY --from=builder --chown=preptracker:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=preptracker:nodejs /app/public ./public

# Migrations, the schema, the generated client and the seed run at startup.
COPY --from=builder --chown=preptracker:nodejs /app/prisma ./prisma
COPY --from=builder --chown=preptracker:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=preptracker:nodejs /app/src/generated ./src/generated
COPY --from=builder --chown=preptracker:nodejs /app/src/lib/auth/password.ts ./src/lib/auth/password.ts

COPY --chown=preptracker:nodejs docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Writable location for backups written from inside the container.
RUN mkdir -p /app/backups && chown preptracker:nodejs /app/backups

USER preptracker
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "server.js"]
