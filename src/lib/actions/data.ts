'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireUserId } from '@/lib/auth/guards';
import { clearSessionCookie } from '@/lib/auth/session';
import { BackupValidationError, restoreBackup } from '@/lib/server/backup';
import { fail, ok, runAction, type ActionResult } from './result';

/**
 * Restore from a JSON backup.
 *
 * Guarded three times over: the user types the confirmation word, the file is
 * validated column by column before anything is written, and the write itself
 * is one transaction. Every row ends up owned by the account doing the restore,
 * so a file can only ever replace your own data — see `lib/backup/schema`.
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      return fail('That file is not valid JSON.');
    }

    let result;
    try {
      result = await restoreBackup(userId, parsed);
    } catch (error) {
      // A rejected file is the expected case, not a crash: say exactly what is
      // wrong with it. Anything else is left to runAction.
      if (error instanceof BackupValidationError) return fail(error.message);
      throw error;
    }

    // The account keeps its id, so the session survives — unless the backup
    // carried a different password, in which case it is no longer the password
    // that was signed in with.
    if (result.credentialsChanged) {
      await clearSessionCookie();
    }

    revalidatePath('/', 'layout');
    return ok(
      { total: result.total, restored: result.restored },
      result.credentialsChanged
        ? `Restored ${result.total} records. This backup had a different password, so sign in again as "${result.username}" with the password it was taken with.`
        : `Restored ${result.total} records.`,
    );
  });
}
