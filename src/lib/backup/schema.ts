import { Prisma } from '@/generated/prisma';
import { BACKUP_TABLES, BACKUP_VERSION, type BackupTable } from './tables';

/**
 * Validation for restore.
 *
 * A backup file is untrusted input: it arrives as JSON through a server action
 * and, before this module existed, went straight to `createMany`. That meant a
 * hand-edited or corrupted file could plant rows owned by another account, and
 * an unknown column produced a Prisma error whose message quoted the row back
 * to the browser.
 *
 * The rules are deliberately narrow:
 *
 *   1. Only columns the current schema actually has are accepted. Anything else
 *      is a different version of the app, and saying so is more useful than a
 *      constraint violation halfway through the transaction.
 *   2. Scalars must match their column type. Dates arrive as ISO strings.
 *   3. Every `userId` is rewritten to the account doing the restore, and the
 *      single user row takes that id too, so a file can only ever replace your
 *      own data.
 *   4. Every other foreign key must resolve to a row inside the same backup.
 *      Without this a row could graft itself onto somebody else's meal plan.
 *
 * Messages name the table and the column and never the value, because the value
 * is someone's diet.
 */

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

type ScalarKind = 'String' | 'Int' | 'Float' | 'Boolean' | 'DateTime' | 'Json' | 'Enum';

interface TableShape {
  /** Prisma model name, e.g. "WaterEntry". */
  model: string;
  /** Column name -> how to check it. */
  columns: Map<string, ScalarKind>;
  /** Foreign-key column -> the backup table it must point into. */
  foreignKeys: Map<string, BackupTable>;
}

function modelNameFor(table: BackupTable): string {
  return table.charAt(0).toUpperCase() + table.slice(1);
}

const MODEL_TO_TABLE = new Map<string, BackupTable>(
  BACKUP_TABLES.map((table) => [modelNameFor(table), table]),
);

/**
 * Built once from the generated client's data model, so it cannot drift from
 * the schema: a new column is accepted the moment it exists, and a removed one
 * stops being accepted.
 *
 * Prisma 7's data model exposes only name, kind and type per field. That is
 * enough to know which columns exist and what shape they are; required-ness and
 * enum membership are left to the database, which rejects them inside the
 * transaction.
 */
function buildShapes(): Map<BackupTable, TableShape> {
  const shapes = new Map<BackupTable, TableShape>();

  for (const table of BACKUP_TABLES) {
    const model = modelNameFor(table);
    const definition = Prisma.dmmf.datamodel.models.find((m) => m.name === model);
    if (!definition) {
      throw new Error(`Backup table "${table}" has no model "${model}" in the schema.`);
    }

    const columns = new Map<string, ScalarKind>();
    const objectFields = new Map<string, string>();

    for (const field of definition.fields) {
      if (field.kind === 'scalar') {
        // BigInt and Decimal are not used by this schema; if one is ever added,
        // treating it as a number is the closest safe reading.
        const numeric = field.type === 'BigInt' || field.type === 'Decimal';
        columns.set(field.name, numeric ? 'Float' : (field.type as ScalarKind));
      } else if (field.kind === 'enum') {
        columns.set(field.name, 'Enum');
      } else if (field.kind === 'object') {
        objectFields.set(field.name, field.type);
      }
    }

    // Forward relations name their key `<relation>Id`; the inverse side has no
    // scalar and is skipped. Verified to hold for all 62 relations in this
    // schema.
    const foreignKeys = new Map<string, BackupTable>();
    for (const [fieldName, targetModel] of objectFields) {
      const key = `${fieldName}Id`;
      if (!columns.has(key)) continue;
      const target = MODEL_TO_TABLE.get(targetModel);
      if (target) foreignKeys.set(key, target);
    }

    shapes.set(table, { model, columns, foreignKeys });
  }

  return shapes;
}

let cachedShapes: Map<BackupTable, TableShape> | null = null;

function shapes(): Map<BackupTable, TableShape> {
  cachedShapes ??= buildShapes();
  return cachedShapes;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function checkValue(table: BackupTable, column: string, kind: ScalarKind, value: unknown): unknown {
  if (value === null || value === undefined) return null;

  switch (kind) {
    case 'String':
    case 'Enum':
      if (typeof value !== 'string') {
        throw new BackupValidationError(`"${table}.${column}" should be text in the backup, but is not.`);
      }
      return value;

    case 'Int':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        throw new BackupValidationError(
          `"${table}.${column}" should be a whole number in the backup, but is not.`,
        );
      }
      return value;

    case 'Float':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BackupValidationError(
          `"${table}.${column}" should be a number in the backup, but is not.`,
        );
      }
      return value;

    case 'Boolean':
      if (typeof value !== 'boolean') {
        throw new BackupValidationError(
          `"${table}.${column}" should be true or false in the backup, but is not.`,
        );
      }
      return value;

    case 'DateTime': {
      if (value instanceof Date) return value;
      if (typeof value !== 'string' || !ISO_DATE.test(value)) {
        throw new BackupValidationError(
          `"${table}.${column}" should be a date in the backup, but is not.`,
        );
      }
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new BackupValidationError(`"${table}.${column}" is not a date the app can read.`);
      }
      return parsed;
    }

    case 'Json':
      return value;
  }
}

export interface ValidatedBackup {
  rows: Record<BackupTable, Array<Record<string, unknown>>>;
  /** The username the backup was taken under, for the message after a restore. */
  username: string;
  /** The password hash in the file, so the caller can tell whether sign-in changes. */
  passwordHash: string | null;
}

/**
 * Check a parsed backup and rewrite it to belong to `userId`.
 *
 * Throws `BackupValidationError` with a message safe to show the user. Nothing
 * has been written to the database at this point, so a rejection costs nothing.
 */
export function validateBackup(input: unknown, userId: string): ValidatedBackup {
  if (!input || typeof input !== 'object') {
    throw new BackupValidationError('That file is not a PrepTracker backup.');
  }

  const file = input as Record<string, unknown>;

  if (file.application !== 'preptracker') {
    throw new BackupValidationError('That file is not a PrepTracker backup.');
  }

  if (typeof file.version !== 'number' || !Number.isInteger(file.version) || file.version < 1) {
    throw new BackupValidationError('That backup does not say which version of PrepTracker wrote it.');
  }

  if (file.version > BACKUP_VERSION) {
    throw new BackupValidationError(
      `This backup was made by a newer version of PrepTracker (v${file.version}). Update the app before restoring it.`,
    );
  }

  if (!file.data || typeof file.data !== 'object' || Array.isArray(file.data)) {
    throw new BackupValidationError('That backup has no data in it.');
  }

  const data = file.data as Record<string, unknown>;
  const tableShapes = shapes();

  const unknownTables = Object.keys(data).filter(
    (key) => !BACKUP_TABLES.includes(key as BackupTable),
  );
  if (unknownTables.length > 0) {
    throw new BackupValidationError(
      `This backup holds data this version of PrepTracker does not know about (${unknownTables
        .slice(0, 3)
        .join(', ')}). Update the app before restoring it.`,
    );
  }

  const rows = {} as Record<BackupTable, Array<Record<string, unknown>>>;

  for (const table of BACKUP_TABLES) {
    const value = data[table];
    if (value === undefined || value === null) {
      rows[table] = [];
      continue;
    }
    if (!Array.isArray(value)) {
      throw new BackupValidationError(`The "${table}" section of this backup is not a list of rows.`);
    }

    const shape = tableShapes.get(table)!;
    rows[table] = value.map((row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        throw new BackupValidationError(`A "${table}" entry in this backup is not a record.`);
      }

      const out: Record<string, unknown> = {};
      for (const [column, raw] of Object.entries(row as Record<string, unknown>)) {
        const kind = shape.columns.get(column);
        if (!kind) {
          throw new BackupValidationError(
            `"${table}" rows in this backup have a "${column}" field, which this version of PrepTracker does not. Update the app before restoring it.`,
          );
        }
        out[column] = checkValue(table, column, kind, raw);
      }
      return out;
    });
  }

  // --- Ownership -----------------------------------------------------------
  const users = rows.user;
  if (users.length === 0) {
    throw new BackupValidationError('This backup contains no account, so there is nothing to restore.');
  }
  if (users.length > 1) {
    throw new BackupValidationError('This backup contains more than one account, which is not supported.');
  }

  const backupUser = users[0]!;
  const username = typeof backupUser.username === 'string' ? backupUser.username : 'your account';
  const passwordHash = typeof backupUser.passwordHash === 'string' ? backupUser.passwordHash : null;

  // The restore always produces data owned by the account doing it. A file can
  // replace what you have; it can never hand rows to someone else.
  backupUser.id = userId;
  for (const table of BACKUP_TABLES) {
    const shape = tableShapes.get(table)!;
    if (!shape.columns.has('userId')) continue;
    for (const row of rows[table]) row.userId = userId;
  }

  // --- Referential integrity ----------------------------------------------
  const idsByTable = new Map<BackupTable, Set<string>>();
  for (const table of BACKUP_TABLES) {
    const ids = new Set<string>();
    for (const row of rows[table]) {
      if (typeof row.id === 'string') ids.add(row.id);
    }
    idsByTable.set(table, ids);
  }

  for (const table of BACKUP_TABLES) {
    const shape = tableShapes.get(table)!;
    if (shape.foreignKeys.size === 0) continue;

    for (const row of rows[table]) {
      for (const [column, target] of shape.foreignKeys) {
        const value = row[column];
        if (value === null || value === undefined) continue;
        if (typeof value !== 'string' || !idsByTable.get(target)!.has(value)) {
          throw new BackupValidationError(
            `A "${table}" row points at a "${target}" that is not in this backup, so the file is incomplete or was edited by hand.`,
          );
        }
      }
    }
  }

  return { rows, username, passwordHash };
}
