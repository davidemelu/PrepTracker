/**
 * Writes a full JSON backup to ./backups.
 *
 *   npm run backup
 *   npm run backup -- --out /path/to/file.json
 *
 * Works against whatever DATABASE_URL points at, so it can be run on the host
 * or inside the container.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
import { exportBackupWith } from '../src/lib/backup/core';

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* optional */
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const users = await prisma.user.findMany({ select: { id: true, username: true } });
    if (users.length === 0) {
      console.error('No users found — is this the right database?');
      process.exitCode = 1;
      return;
    }

    const outDir = path.join(process.cwd(), 'backups');
    mkdirSync(outDir, { recursive: true });

    for (const user of users) {
      const backup = await exportBackupWith(prisma, user.id);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const target =
        argValue('--out') ?? path.join(outDir, `preptracker-${user.username}-${stamp}.json`);

      writeFileSync(target, JSON.stringify(backup, null, 2), 'utf8');

      const rows = Object.values(backup.data).reduce((sum, list) => sum + list.length, 0);
      console.log(`Backed up ${rows} rows for "${user.username}" to ${target}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Backup failed:', error);
  process.exit(1);
});
