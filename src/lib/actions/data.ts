'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/guards';
import { clearSessionCookie } from '@/lib/auth/session';
import { restoreBackup, type BackupFile } from '@/lib/server/backup';
import { fail, ok, runAction, type ActionResult } from './result';

/**
 * Restore from a JSON backup.
 *
 * Guarded twice: the file has to look like a PrepTracker backup, and the user
 * has to type the confirmation word, because this replaces everything.
 */

const restoreSchema = z.object({
  json: z.string().min(2, 'Choose a backup file.'),
  confirm: z.literal('REPLACE', {
    error: 'Type REPLACE to confirm that this will overwrite all of your current data.',
  }),
});

export async function restoreFromBackup(input: {
  json: string;
  confirm: string;
}): Promise<ActionResult<{ total: number; restored: Record<string, number> }>> {
  return runAction(restoreSchema, input, async ({ json }) => {
    const userId = await requireUserId();

    let parsed: BackupFile;
    try {
      parsed = JSON.parse(json) as BackupFile;
    } catch {
      return fail('That file is not valid JSON.');
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.data) {
      return fail('That file does not look like a PrepTracker backup.');
    }

    const users = parsed.data.user as Array<{ id: string; username: string }> | undefined;
    if (!users || users.length === 0) {
      return fail('The backup contains no user record.');
    }
    if (users.length > 1) {
      return fail('That backup contains more than one user, which is not supported.');
    }

    const backupUser = users[0]!;

    // The backup carries its own user row, ids included. Restoring it replaces
    // the current account entirely — which is the point after a fresh install,
    // where the ids will never match. When they differ, the current session is
    // no longer valid afterwards, so it is cleared and you sign in with the
    // credentials the backup was taken with.
    const replacesAccount = backupUser.id !== userId;

    const result = await restoreBackup(userId, parsed);

    if (replacesAccount) {
      await clearSessionCookie();
    }

    revalidatePath('/', 'layout');
    return ok(
      result,
      replacesAccount
        ? `Restored ${result.total} records. Sign in again as "${backupUser.username}" using the password from that backup.`
        : `Restored ${result.total} records.`,
    );
  });
}
