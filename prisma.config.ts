import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer loads .env implicitly. Node's own loader is enough here and
// keeps dotenv out of the dependency tree.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    // Missing env file is fine: the value may come from the real environment
    // (Docker, CI) instead.
  }
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
