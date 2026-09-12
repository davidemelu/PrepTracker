import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

/**
 * Prisma configuration used only by the migration-drift check in CI.
 *
 * `prisma migrate diff --from-migrations` has to replay every migration into an
 * empty shadow database to work out what the migrations actually produce, and
 * Prisma 7 takes that database from `datasource.shadowDatabaseUrl` in the config
 * file rather than from a command-line flag.
 *
 * It lives here rather than in the repository's own prisma.config.ts because
 * `env()` resolves when the config loads: putting SHADOW_DATABASE_URL there would
 * make every everyday `prisma` command fail on a machine that has never needed a
 * shadow database.
 *
 *   npx prisma migrate diff \
 *     --config scripts/ci/prisma.config.ci.ts \
 *     --from-migrations prisma/migrations \
 *     --to-schema prisma/schema.prisma \
 *     --exit-code
 *
 * Exit code 2 means the migrations and schema.prisma describe different
 * databases — almost always a schema edited without a migration being created.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
    shadowDatabaseUrl: env('SHADOW_DATABASE_URL'),
  },
});
