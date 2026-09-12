/**
 * Workout focus: what you trained on a given day.
 *
 * Pure, like the rest of `domain`. The catalogue of focuses is user data, so
 * nothing here hard-codes a body part — the constants below are only used to
 * seed the initial list and to order the picker.
 */

export type WorkoutFocusCategoryKey = 'MUSCLE_GROUP' | 'SPLIT' | 'CONDITIONING' | 'OTHER';

export const WORKOUT_CATEGORY_LABELS: Record<WorkoutFocusCategoryKey, string> = {
  MUSCLE_GROUP: 'Muscle groups',
  SPLIT: 'Splits',
  CONDITIONING: 'Conditioning',
  OTHER: 'Other',
};

/** Display order for the picker. */
export const WORKOUT_CATEGORY_ORDER: WorkoutFocusCategoryKey[] = [
  'MUSCLE_GROUP',
  'SPLIT',
  'CONDITIONING',
  'OTHER',
];

export interface WorkoutFocusLike {
  id: string;
  name: string;
  category: WorkoutFocusCategoryKey;
  sortOrder: number;
  active: boolean;
  /**
   * How long before training the pre-workout meal should sit when this focus is
   * part of the session, in minutes. Null means "use the default".
   */
  preWorkoutMinutes?: number | null;
}

export interface DayWorkout {
  /** Free-text session name, e.g. "Upper A". */
  workoutName: string | null;
  /** Ordered focus names as recorded on the day. */
  focusNames: string[];
}

export const MAX_FOCUSES_PER_DAY = 12;
export const MAX_WORKOUT_NAME_LENGTH = 60;

/**
 * How a day's training reads on screen.
 *
 * "Chest + Triceps", or "Upper A" when only a name is set, or
 * "Upper A · Chest + Triceps" when both are. Returns null when nothing has been
 * recorded, so callers can show a prompt instead of an empty string.
 */
export function formatWorkout(workout: DayWorkout): string | null {
  const focuses = workout.focusNames.filter((name) => name.trim().length > 0);
  const name = workout.workoutName?.trim() || null;

  const joined = focuses.join(' + ');

  if (name && joined) return `${name} · ${joined}`;
  if (name) return name;
  if (joined) return joined;
  return null;
}

/** Compact form for dense rows such as the weekly tracker. */
export function formatWorkoutShort(workout: DayWorkout, maxFocuses = 3): string | null {
  const name = workout.workoutName?.trim() || null;
  const focuses = workout.focusNames.filter((n) => n.trim().length > 0);

  if (focuses.length === 0) return name;

  const shown = focuses.slice(0, maxFocuses).join(' + ');
  const extra = focuses.length - Math.min(focuses.length, maxFocuses);
  const focusText = extra > 0 ? `${shown} +${extra}` : shown;

  return name ? `${name} · ${focusText}` : focusText;
}

export function hasWorkout(workout: DayWorkout): boolean {
  return formatWorkout(workout) !== null;
}

export interface WorkoutValidation {
  ok: boolean;
  message?: string;
}

export function validateWorkoutName(name: string | null | undefined): WorkoutValidation {
  if (name == null) return { ok: true };
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: true };
  if (trimmed.length > MAX_WORKOUT_NAME_LENGTH) {
    return {
      ok: false,
      message: `Workout names must be ${MAX_WORKOUT_NAME_LENGTH} characters or fewer.`,
    };
  }
  return { ok: true };
}

export function validateFocusSelection(focusIds: readonly string[]): WorkoutValidation {
  if (focusIds.length > MAX_FOCUSES_PER_DAY) {
    return {
      ok: false,
      message: `Pick at most ${MAX_FOCUSES_PER_DAY} focuses for one day.`,
    };
  }
  if (new Set(focusIds).size !== focusIds.length) {
    return { ok: false, message: 'The same focus was selected more than once.' };
  }
  return { ok: true };
}

/**
 * Resolve chosen ids to focus rows, dropping unknown ones and preserving the
 * catalogue's own ordering so "Chest + Triceps" never comes out as
 * "Triceps + Chest" depending on tap order.
 */
export function resolveFocuses(
  focusIds: readonly string[],
  catalogue: readonly WorkoutFocusLike[],
): WorkoutFocusLike[] {
  const chosen = new Set(focusIds);
  return catalogue
    .filter((focus) => chosen.has(focus.id))
    .sort((a, b) => {
      const ca = WORKOUT_CATEGORY_ORDER.indexOf(a.category);
      const cb = WORKOUT_CATEGORY_ORDER.indexOf(b.category);
      if (ca !== cb) return ca - cb;
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
}

/** Group the catalogue for the picker, dropping empty categories. */
export function groupFocuses(
  catalogue: readonly WorkoutFocusLike[],
): Array<{ category: WorkoutFocusCategoryKey; label: string; focuses: WorkoutFocusLike[] }> {
  const groups = new Map<WorkoutFocusCategoryKey, WorkoutFocusLike[]>();
  for (const focus of catalogue) {
    if (!focus.active) continue;
    const list = groups.get(focus.category) ?? [];
    list.push(focus);
    groups.set(focus.category, list);
  }

  return WORKOUT_CATEGORY_ORDER.filter((c) => groups.has(c)).map((category) => ({
    category,
    label: WORKOUT_CATEGORY_LABELS[category],
    focuses: groups
      .get(category)!
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
  }));
}

/**
 * How long before training to eat, given what is being trained.
 *
 * Takes the longest gap any of the day's focuses asks for, so a session of
 * legs plus calves uses the leg timing rather than whichever happened to be
 * picked first. Nothing here knows what "legs" means: the requirement lives on
 * the focus row, so you can set it for anything.
 */
export function effectivePreWorkoutMinutes(
  defaultMinutes: number,
  focuses: readonly Pick<WorkoutFocusLike, 'preWorkoutMinutes'>[],
): number {
  const overrides = focuses
    .map((f) => f.preWorkoutMinutes)
    .filter((value): value is number => typeof value === 'number' && value >= 0);

  return overrides.length === 0 ? defaultMinutes : Math.max(defaultMinutes, ...overrides);
}

export interface WorkoutHistoryEntry {
  date: string;
  isTraining: boolean;
  workout: DayWorkout;
}

/**
 * How often each focus was trained over a period. Rest days are ignored, and so
 * are training days with nothing recorded.
 */
export function focusFrequency(
  entries: readonly WorkoutHistoryEntry[],
): Array<{ name: string; sessions: number }> {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    if (!entry.isTraining) continue;
    for (const name of entry.workout.focusNames) {
      const key = name.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([name, sessions]) => ({ name, sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

/** Training days in a period that have no workout recorded. */
export function untrackedTrainingDays(entries: readonly WorkoutHistoryEntry[]): string[] {
  return entries.filter((e) => e.isTraining && !hasWorkout(e.workout)).map((e) => e.date);
}
