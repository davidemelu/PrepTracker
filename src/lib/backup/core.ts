import type { PrismaClient } from '@/generated/prisma';
import { BACKUP_TABLES, BACKUP_VERSION, type BackupTable } from './tables';
import { BackupValidationError, validateBackup } from './schema';

/**
 * Backup and restore, independent of how the Prisma client was created.
 *
 * Takes a client as an argument rather than importing the app singleton, so the
 * same code serves the in-app export, the CLI scripts and the tests.
 */

export { BACKUP_TABLES, BACKUP_VERSION, BackupValidationError };
export type { BackupTable };

export interface BackupFile {
  version: number;
  exportedAt: string;
  application: 'preptracker';
  data: Record<string, unknown[]>;
}

/** Scopes every table to one user, directly or through its parent. */
export function scopesFor(userId: string): Record<BackupTable, unknown> {
  return {
    user: { id: userId },
    settings: { userId },
    appSetting: { userId },
    dayType: { userId },
    scheduleDay: { userId },
    workoutFocus: { userId },
    scheduleDayFocus: { scheduleDay: { userId } },
    food: { userId },
    foodOptionGroup: { userId },
    foodOptionGroupMember: { group: { userId } },
    planWeekPreference: { userId },
    mealPlan: { userId },
    meal: { mealPlan: { userId } },
    mealDayTypeSetting: { meal: { mealPlan: { userId } } },
    mealIngredient: { meal: { mealPlan: { userId } } },
    mealIngredientQuantity: { mealIngredient: { meal: { mealPlan: { userId } } } },
    supplement: { userId },
    supplementSchedule: { supplement: { userId } },
    dailyPlan: { userId },
    dailyWorkoutFocus: { dailyPlan: { userId } },
    dailyMeal: { dailyPlan: { userId } },
    dailyMealItem: { dailyMeal: { dailyPlan: { userId } } },
    mealCompletion: { dailyMeal: { dailyPlan: { userId } } },
    dailySupplement: { dailyPlan: { userId } },
    supplementCompletion: { dailySupplement: { dailyPlan: { userId } } },
    waterEntry: { userId },
    dailyCheckIn: { dailyPlan: { userId } },
    groceryWeek: { userId },
    groceryItem: { groceryWeek: { userId } },
    inventoryItem: { userId },
    prepSession: { userId },
    prepTask: { prepSession: { userId } },
    prepBatch: { prepSession: { userId } },
    cookingYield: { userId },
    storagePortion: { userId },
  };
}

// Prisma's delegates share a shape; this keeps the loops readable instead of
// hand-writing 35 near-identical calls.
export interface Delegate {
  findMany: (args?: unknown) => Promise<unknown[]>;
  createMany: (args: { data: unknown[] }) => Promise<{ count: number }>;
  deleteMany: (args?: unknown) => Promise<{ count: number }>;
}

type ClientLike = Record<BackupTable, Delegate>;

export async function exportBackupWith(
  client: PrismaClient,
  userId: string,
): Promise<BackupFile> {
  const delegates = client as unknown as ClientLike;
  const scopes = scopesFor(userId);
  const data: Record<string, unknown[]> = {};

  for (const table of BACKUP_TABLES) {
    data[table] = await delegates[table].findMany({ where: scopes[table] });
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    application: 'preptracker',
    data,
  };
}

export interface RestoreResult {
  restored: Record<string, number>;
  total: number;
  /** The account name in the file, for the message shown afterwards. */
  username: string;
  /** True when the restore changed the password, so the session must be dropped. */
  credentialsChanged: boolean;
}

/**
 * Replace everything belonging to `userId` with the backup's contents.
 *
 * Destructive by design — this is "restore", not "merge". Three properties hold:
 *
 *   - The file is fully validated before a single row is touched, so a bad file
 *     changes nothing and says why (see `./schema`).
 *   - Every row ends up owned by `userId`, whatever the file claimed.
 *   - It runs in one transaction under an advisory lock, so two restores cannot
 *     interleave and a failure half way leaves the existing data untouched.
 *
 * The old data is deleted table by table in reverse dependency order rather
 * than by cascading from the user row, because the completion logs and plan
 * ingredients are now `onDelete: Restrict` — deliberately, so that nothing else
 * in the app can delete them by accident.
 */
export async function restoreBackupWith(
  client: PrismaClient,
  userId: string,
  backup: unknown,
): Promise<RestoreResult> {
  const { rows, username, passwordHash } = validateBackup(backup, userId);

  const current = await client.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  const credentialsChanged = passwordHash !== null && passwordHash !== current?.passwordHash;

  const restored: Record<string, number> = {};

  await client.$transaction(
    async (tx) => {
      // Serialise restores for one account: two at once would race on deleting
      // and re-inserting the same user row.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`restore:${userId}`}, 0))`;

      const delegates = tx as unknown as ClientLike;
      const scopes = scopesFor(userId);

      for (const table of [...BACKUP_TABLES].reverse()) {
        await delegates[table].deleteMany({ where: scopes[table] });
      }

      for (const table of BACKUP_TABLES) {
        const data = rows[table];
        if (data.length === 0) {
          restored[table] = 0;
          continue;
        }
        const result = await delegates[table].createMany({ data });
        restored[table] = result.count;
      }
    },
    { timeout: 120_000 },
  );

  return {
    restored,
    total: Object.values(restored).reduce((sum, n) => sum + n, 0),
    username,
    credentialsChanged,
  };
}

/** Minimal, dependency-free CSV writer with correct quoting. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return '';

  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];

  const escape = (value: unknown): string => {
    if (value == null) return '';
    const text =
      value instanceof Date
        ? value.toISOString()
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);

    // A leading =, +, - or @ makes a spreadsheet treat the cell as a formula.
    // Food names and notes are user text, so prefix those with an apostrophe.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
  };

  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(',')),
  ].join('\r\n');
}
