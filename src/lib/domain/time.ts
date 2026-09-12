/**
 * Clock-time helpers. Times are stored as "HH:mm" strings in local time, which
 * keeps them independent of any date and immune to timezone drift when a plan
 * is edited months later.
 */

export const MINUTES_PER_DAY = 24 * 60;

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/** "13:30" -> 810. Throws on malformed input so bad data cannot spread. */
export function timeToMinutes(value: string): number {
  if (!isValidTime(value)) {
    throw new Error(`Invalid time "${value}". Expected 24-hour HH:mm.`);
  }
  const [h, m] = value.split(':');
  return Number(h) * 60 + Number(m);
}

/** 810 -> "13:30". Wraps past midnight so a 01:00 bedtime stays valid. */
export function minutesToTime(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function addMinutes(time: string, minutes: number): string {
  return minutesToTime(timeToMinutes(time) + minutes);
}

/** "13:30" -> "1:30 PM" */
export function formatTime12h(value: string): string {
  if (!isValidTime(value)) return value;
  const total = timeToMinutes(value);
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Renders "5:30 – 6:00 PM" for a meal with an eating window. */
export function formatTimeRange(start: string, windowMinutes?: number | null): string {
  if (!windowMinutes || windowMinutes <= 0) return formatTime12h(start);
  const end = addMinutes(start, windowMinutes);
  const startLabel = formatTime12h(start);
  const endLabel = formatTime12h(end);
  const startSuffix = startLabel.slice(-2);
  const endSuffix = endLabel.slice(-2);
  // Drop the repeated AM/PM: "5:30 – 6:00 PM" rather than "5:30 PM – 6:00 PM".
  return startSuffix === endSuffix
    ? `${startLabel.slice(0, -3)} – ${endLabel}`
    : `${startLabel} – ${endLabel}`;
}

/**
 * Minutes from `from` to `to`, treating the schedule as a rolling day that can
 * cross midnight. A meal at 01:00 seen from 23:00 is 120 minutes away, not
 * -1320.
 */
export function minutesUntil(from: string, to: string): number {
  const diff = timeToMinutes(to) - timeToMinutes(from);
  return diff >= 0 ? diff : diff + MINUTES_PER_DAY;
}

/**
 * Signed offset used to decide whether a meal is upcoming or overdue. Anything
 * more than `lookBackMinutes` in the past is treated as tomorrow's occurrence.
 */
export function relativeMinutes(now: string, target: string, lookBackMinutes = 6 * 60): number {
  const diff = timeToMinutes(target) - timeToMinutes(now);
  if (diff < -lookBackMinutes) return diff + MINUTES_PER_DAY;
  return diff;
}

/**
 * How late a meal has to be before it is called overdue. Short enough to be
 * useful, long enough that a meal is not nagging about itself while you are
 * still standing at the hob.
 */
export const OVERDUE_GRACE_MINUTES = 15;

/**
 * How far back a scheduled time can be and still belong to today. Beyond this
 * the clock has wrapped and the time belongs to tomorrow's occurrence, not to a
 * meal that is nineteen hours late.
 */
export const OVERDUE_WINDOW_MINUTES = 12 * 60;

/**
 * Minutes a meal is overdue by, or null when it is not overdue.
 *
 * The single definition. Today's rows and the reminder list used to disagree:
 * one looked back twelve hours with a fifteen-minute grace, the other six hours
 * with none, so a meal seven and a half hours late was overdue on the screen
 * and absent from the reminders that are supposed to summarise it.
 */
export function overdueByMinutes(
  nowTime: string,
  scheduledTime: string,
  graceMinutes = OVERDUE_GRACE_MINUTES,
): number | null {
  const delta = relativeMinutes(nowTime, scheduledTime, OVERDUE_WINDOW_MINUTES);
  return delta < -graceMinutes ? -delta : null;
}

/** 95 -> "1h 35m", 40 -> "40m", -20 -> "20m ago" */
export function formatDuration(minutes: number): string {
  const abs = Math.abs(Math.round(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const core = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  return minutes < 0 ? `${core} ago` : core;
}

/** Local "HH:mm" for a Date, used to compare against stored meal times. */
export function currentTimeString(now: Date = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

/**
 * How far a meal was eaten from its planned time.
 *
 * Positive means late. Null when either time is missing, so callers show
 * nothing rather than a misleading zero.
 */
export function timingDelta(planned: string | null, actual: string | null): number | null {
  if (!planned || !actual || !isValidTime(planned) || !isValidTime(actual)) return null;

  const diff = timeToMinutes(actual) - timeToMinutes(planned);
  // A meal planned for 23:00 and eaten at 00:20 is 80 minutes late, not 22
  // hours early. Anything beyond half a day is the clock wrapping.
  if (diff > MINUTES_PER_DAY / 2) return diff - MINUTES_PER_DAY;
  if (diff < -MINUTES_PER_DAY / 2) return diff + MINUTES_PER_DAY;
  return diff;
}

/**
 * "17 min late" / "5 min early" / "on time". Null when there is nothing to
 * compare, and quiet about differences small enough not to matter.
 */
export function formatTimingDelta(
  planned: string | null,
  actual: string | null,
  toleranceMinutes = 5,
): string | null {
  const delta = timingDelta(planned, actual);
  if (delta === null) return null;
  if (Math.abs(delta) <= toleranceMinutes) return 'on time';
  return delta > 0 ? `${formatDuration(delta)} late` : `${formatDuration(-delta)} early`;
}
