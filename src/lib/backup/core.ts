import type { PrismaClient } from '@/generated/prisma';

/**
 * Backup and restore, independent of how the Prisma client was created.
 *
 * Takes a client as an argument rather than importing the app singleton, so the
 * same code serves the in-app export, the CLI scripts and the tests.
 */

export const BACKUP_VERSION = 1;

export interface BackupFile {
  version: number;
  exportedAt: string;
  application: 'preptracker';
  data: Record<string, unknown[]>;
}

/**
 * Parents before children: foreign keys are enforced, so restore order matters.
 * The same order is used to write and to read.
 */
export const BACKUP_TABLES = [
  'user',
  'settings',
  'appSetting',
  'dayType',
  'scheduleDay',
  'workoutFocus',
  'scheduleDayFocus',
  'food',
  'foodOptionGroup',
  'foodOptionGroupMember',
  'planWeekPreference',
  'mealPlan',
  'meal',
  'mealDayTypeSetting',
  'mealIngredient',
  'mealIngredientQuantity',
  'supplement',
  'supplementSchedule',
  'dailyPlan',
  'dailyWorkoutFocus',
  'dailyMeal',
  'dailyMealItem',
  'mealCompletion',
  'dailySupplement',
  'supplementCompletion',
  'waterEntry',
  'dailyCheckIn',
  'groceryWeek',
  'groceryItem',
  'inventoryItem',
  'prepSession',
  'prepTask',
  'prepBatch',
  'cookingYield',
  'storagePortion',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

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
// hand-writing 32 near-identical calls.
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
}

/**
 * Replace everything belonging to `userId` with the backup's contents.
 *
 * Destructive by design — this is "restore", not "merge" — and wrapped in one
 * transaction, so a malformed file leaves the existing data untouched.
 */
export async function restoreBackupWith(
  client: PrismaClient,
  userId: string,
  backup: BackupFile,
): Promise<RestoreResult> {
  if (backup.application !== 'preptracker') {
    throw new Error('That file is not a PrepTracker backup.');
  }
  if (backup.version > BACKUP_VERSION) {
    throw new Error(
      `This backup was made by a newer version of PrepTracker (v${backup.version}). Update the app before restoring it.`,
    );
  }

  const restored: Record<string, number> = {};

  await client.$transaction(
    async (tx) => {
      const delegates = tx as unknown as ClientLike;

      // Deleting the user cascades to everything they own.
      await delegates.user.deleteMany({ where: { id: userId } });

      for (const table of BACKUP_TABLES) {
        const rows = backup.data[table];
        if (!Array.isArray(rows) || rows.length === 0) {
          restored[table] = 0;
          continue;
        }

        const revived = rows.map((row) => reviveDates(row as Record<string, unknown>));
        const result = await delegates[table].createMany({ data: revived });
        restored[table] = result.count;
      }
    },
    { timeout: 120_000 },
  );

  return {
    restored,
    total: Object.values(restored).reduce((sum, n) => sum + n, 0),
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** JSON has no Date type; turn ISO strings back into Dates for Prisma. */
export function reviveDates(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === 'string' && ISO_DATE.test(value) ? new Date(value) : value;
  }
  return out;
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
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => escape(row[column])).join(',')),
  ].join('\r\n');
}
