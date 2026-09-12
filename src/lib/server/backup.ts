import 'server-only';

import { prisma } from '@/lib/db';
import {
  exportBackupWith,
  restoreBackupWith,
  type BackupFile,
  type RestoreResult,
} from '@/lib/backup/core';

/**
 * The in-app entry points for backup and restore. All the logic lives in
 * `lib/backup/core` so the CLI scripts and tests can reuse it with their own
 * Prisma client.
 */

export { BACKUP_VERSION, toCsv } from '@/lib/backup/core';
export type { BackupFile, RestoreResult } from '@/lib/backup/core';

export function exportBackup(userId: string): Promise<BackupFile> {
  return exportBackupWith(prisma, userId);
}

export function restoreBackup(userId: string, backup: BackupFile): Promise<RestoreResult> {
  return restoreBackupWith(prisma, userId, backup);
}
