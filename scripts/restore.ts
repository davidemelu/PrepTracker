/**
 * Restores a JSON backup, replacing everything currently in the database.
 *
 *   npm run restore -- ./backups/preptracker-admin-2026-09-11T10-00-00.json
 *   npm run restore -- <file> --yes     # skip the confirmation prompt
 *
 * The backup's own user id is used, so a restore reproduces the data exactly.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma';
import { restoreBackupWith, type BackupFile } from '../src/lib/backup/core';

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

const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!file) {
  console.error('Usage: npm run restore -- <backup.json> [--yes]');
  process.exit(1);
}

async function confirm(): Promise<boolean> {
  if (process.argv.includes('--yes')) return true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    'This REPLACES all current PrepTracker data with the backup. Type REPLACE to continue: ',
  );
  rl.close();
  return answer.trim() === 'REPLACE';
}

async function main() {
  const backup = JSON.parse(readFileSync(file!, 'utf8')) as BackupFile;

  if (backup.application !== 'preptracker') {
    console.error('That file is not a PrepTracker backup.');
    process.exit(1);
  }

  const users = backup.data.user as Array<{ id: string; username: string }> | undefined;
  if (!users || users.length === 0) {
    console.error('The backup contains no user record.');
    process.exit(1);
  }

  const rows = Object.values(backup.data).reduce((sum, list) => sum + list.length, 0);
  console.log(`Backup: ${file}`);
  console.log(`  taken     ${backup.exportedAt}`);
  console.log(`  user      ${users.map((u) => u.username).join(', ')}`);
  console.log(`  rows      ${rows}`);

  if (!(await confirm())) {
    console.log('Cancelled. Nothing was changed.');
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    // The backup carries exactly one account. Restoring it into an existing
    // install replaces that account's data in place; into a fresh one it
    // recreates it. Either way every row ends up owned by the target id.
    const target = await prisma.user.findUnique({ where: { id: users[0]!.id } });
    const userId = target?.id ?? users[0]!.id;

    const result = await restoreBackupWith(prisma, userId, backup);
    console.log(`Restored ${result.total} rows for "${result.username}".`);
    if (result.credentialsChanged) {
      console.log('The password came from the backup; sign in with the one it was taken with.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Restore failed:', error);
  process.exit(1);
});
