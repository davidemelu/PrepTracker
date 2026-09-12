/**
 * Calendar-date helpers.
 *
 * A "day key" is an ISO calendar date string, YYYY-MM-DD, in the server's local
 * timezone (set TZ in .env). Storing and comparing days as strings avoids the
 * classic bug where a UTC Date shifts a meal into the previous day for anyone
 * west of Greenwich.
 */

export type DayKey = string;

export function toDayKey(date: Date): DayKey {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isValidDayKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = fromDayKey(value);
  return toDayKey(date) === value;
}

/** Local midnight for a day key. */
export function fromDayKey(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

/**
 * Postgres `@db.Date` columns round-trip through Prisma as UTC midnight. Build
 * that value explicitly so a day key never lands on the wrong calendar date.
 */
export function toDbDate(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

/** Inverse of toDbDate: read a @db.Date back as a day key. */
export function fromDbDate(date: Date): DayKey {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayKey(now: Date = new Date()): DayKey {
  return toDayKey(now);
}

export function addDays(key: DayKey, days: number): DayKey {
  const date = fromDayKey(key);
  date.setDate(date.getDate() + days);
  return toDayKey(date);
}

export function diffDays(a: DayKey, b: DayKey): number {
  const ms = fromDayKey(a).getTime() - fromDayKey(b).getTime();
  return Math.round(ms / 86_400_000);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export function isoWeekday(key: DayKey): number {
  const js = fromDayKey(key).getDay();
  return js === 0 ? 7 : js;
}

/** Start of the week containing `key`. weekStartsOn uses the ISO numbering. */
export function startOfWeek(key: DayKey, weekStartsOn = 1): DayKey {
  const current = isoWeekday(key);
  const delta = (current - weekStartsOn + 7) % 7;
  return addDays(key, -delta);
}

export function endOfWeek(key: DayKey, weekStartsOn = 1): DayKey {
  return addDays(startOfWeek(key, weekStartsOn), 6);
}

/** Inclusive list of day keys. */
export function dayRange(start: DayKey, end: DayKey): DayKey[] {
  const out: DayKey[] = [];
  const total = diffDays(end, start);
  for (let i = 0; i <= total; i += 1) out.push(addDays(start, i));
  return out;
}

/** `count` day keys starting at `start`. */
export function daysFrom(start: DayKey, count: number): DayKey[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => addDays(start, i));
}

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function weekdayName(isoDay: number): string {
  return WEEKDAY_NAMES[isoDay - 1] ?? '';
}

export function weekdayShort(isoDay: number): string {
  return (WEEKDAY_NAMES[isoDay - 1] ?? '').slice(0, 3);
}

/** "Thu 11 Sep" — compact enough for a phone header. */
export function formatDayShort(key: DayKey): string {
  const date = fromDayKey(key);
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** "Thursday, 11 September 2026" */
export function formatDayLong(key: DayKey): string {
  const date = fromDayKey(key);
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function relativeDayLabel(key: DayKey, today: DayKey = todayKey()): string {
  const delta = diffDays(key, today);
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return formatDayShort(key);
}
