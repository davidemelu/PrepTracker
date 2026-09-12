/**
 * Meal time generation.
 *
 * Nothing here knows about a specific plan: it takes the ordered meals of
 * whatever plan is active plus the user's timing preferences and returns a
 * suggested time for each meal. The result is a *suggestion* — the caller
 * decides whether to persist it — because every meal also supports a manual
 * time override.
 */

import { addMinutes, formatTimeRange, minutesUntil, timeToMinutes } from './time';

export interface TimingPreferences {
  /** When eating starts, "HH:mm". */
  firstMealTime: string;
  /** Shortest comfortable gap between consecutive meals, minutes. */
  mealIntervalMinutes: number;
  /**
   * Longest comfortable gap, minutes. Defaults to the minimum, which makes the
   * interval a single value again. Meals between two anchors are spread evenly
   * across the space available, so this band is what the result is *checked*
   * against rather than a step that is counted out.
   */
  mealIntervalMaxMinutes?: number;
  /** How long a meal takes to eat, minutes. Used for the bedtime guard. */
  mealDurationMinutes: number;
  workoutTime: string;
  workoutDurationMinutes: number;
  /** Latest sensible time to finish eating, "HH:mm". May be after midnight. */
  bedtime: string;
  /**
   * Gap between the pre-workout meal and the start of training. Callers pass a
   * value already adjusted for the day: a leg session usually wants longer than
   * a pressing one.
   */
  preWorkoutMinutes: number;
  /** Gap between the end of training and the next meal. */
  postWorkoutMinutes: number;
  /**
   * False on a rest day. With no session to eat around, the pre- and
   * post-workout anchors are ignored and meals simply fall on the interval.
   */
  hasWorkout?: boolean;
  /**
   * Target window for the last meal, "HH:mm" each. When both are given the
   * final meal is anchored inside the window if the rest of the day allows,
   * which is what stops a late workout from pushing dinner into the night.
   * Omit both to let the last meal fall wherever the interval puts it.
   */
  lastMealEarliest?: string | null;
  lastMealLatest?: string | null;
}

export interface SchedulableMeal {
  id: string;
  name: string;
  sortOrder: number;
  isPreWorkout: boolean;
  isPostWorkout: boolean;
  windowMinutes?: number | null;
  /** A time the user pinned by hand. Generation keeps it and works around it. */
  manualTime?: string | null;
}

export type ScheduleReason =
  | 'first-meal'
  | 'interval'
  | 'pre-workout'
  | 'post-workout'
  | 'last-meal'
  | 'manual'
  | 'compressed-for-bedtime';

export interface ScheduledMeal {
  mealId: string;
  name: string;
  time: string;
  windowMinutes?: number | null;
  reason: ScheduleReason;
  label: string;
}

export interface GeneratedSchedule {
  meals: ScheduledMeal[];
  workoutStart: string;
  workoutEnd: string;
  /** Human-readable problems, e.g. the plan running past bedtime. */
  warnings: string[];
}

const MIN_GAP_MINUTES = 30;

/** "7.5 hours", "3 hours", "45 minutes" — for warning text, not for display. */
function formatGapHours(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} minutes`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

/**
 * How far outside the comfortable band a gap must fall before it is reported.
 *
 * Spreading rarely lands on a round number, and a quarter of an hour either way
 * is not something to interrupt anyone about. Wide enough to stay quiet about
 * arithmetic, narrow enough that a genuinely wrong gap still surfaces.
 */
const GAP_TOLERANCE_MINUTES = 20;

const REASON_LABELS: Record<ScheduleReason, string> = {
  'first-meal': 'first meal',
  interval: 'interval',
  'pre-workout': 'pre-workout',
  'post-workout': 'post-workout',
  'last-meal': 'last meal',
  manual: 'pinned',
  'compressed-for-bedtime': 'bedtime',
};

/**
 * Produce a time for every meal.
 *
 * The day is built from *anchors* — points fixed by something real — and the
 * meals between them are spread evenly across whatever space is left:
 *
 *  1. a manual time the user set on the meal
 *  2. the first meal, at `firstMealTime`
 *  3. any meal flagged pre-workout, at workoutStart - preWorkoutMinutes
 *  4. the first meal after the workout, at workoutEnd + postWorkoutMinutes
 *  5. the last meal, inside `lastMealEarliest`–`lastMealLatest` when both given
 *
 * Spreading, rather than counting out a fixed step from the first meal, is what
 * lets a day absorb a workout that moves. Training at 15:00 and training at
 * 20:00 both give an evenly paced day, instead of a tidy morning followed by
 * one enormous hole wherever the pre-workout meal happened to land. Gaps that
 * still end up outside `mealIntervalMinutes`–`mealIntervalMaxMinutes` are
 * reported rather than hidden.
 */
export function generateMealTimes(
  meals: readonly SchedulableMeal[],
  prefs: TimingPreferences,
): GeneratedSchedule {
  const ordered = [...meals].sort((a, b) => a.sortOrder - b.sortOrder);
  const warnings: string[] = [];
  const workoutStart = prefs.workoutTime;
  const workoutEnd = addMinutes(workoutStart, Math.max(0, prefs.workoutDurationMinutes));

  if (ordered.length === 0) {
    return { meals: [], workoutStart, workoutEnd, warnings };
  }

  /*
   * The day starts at the first meal.
   *
   * If that meal has been pinned by hand — a per-day-type override, say — the
   * pin is where the day starts and everything else cascades from it. Without
   * this, a pin earlier in the clock than `firstMealTime` measures as almost a
   * full day forwards and drags every later meal around the clock with it.
   * Pins on *later* meals keep wrapping forwards, which is correct: a meal
   * pinned to 06:00 on a day that starts at 13:00 is tomorrow morning.
   */
  const origin = ordered[0]!.manualTime ?? prefs.firstMealTime;
  /** Convert a clock time to minutes after the first meal (always forwards). */
  const offsetOf = (time: string) => minutesUntil(origin, time);

  const minInterval = Math.max(MIN_GAP_MINUTES, prefs.mealIntervalMinutes);
  const maxInterval = Math.max(minInterval, prefs.mealIntervalMaxMinutes ?? minInterval);

  // Which meal, if any, eats immediately after training. On a rest day there is
  // no session, so neither anchor applies and the day is a plain cascade.
  const hasWorkout = prefs.hasWorkout ?? true;
  const preWorkoutIndex = hasWorkout ? ordered.findIndex((m) => m.isPreWorkout) : -1;
  let postWorkoutIndex = hasWorkout ? ordered.findIndex((m) => m.isPostWorkout) : -1;
  if (hasWorkout && postWorkoutIndex === -1 && preWorkoutIndex !== -1 && preWorkoutIndex + 1 < ordered.length) {
    postWorkoutIndex = preWorkoutIndex + 1;
  }

  const anchors = new Map<number, { offset: number; reason: ScheduleReason }>();
  anchors.set(0, { offset: 0, reason: 'first-meal' });
  if (preWorkoutIndex >= 0) {
    anchors.set(preWorkoutIndex, {
      offset: offsetOf(addMinutes(workoutStart, -Math.max(0, prefs.preWorkoutMinutes))),
      reason: 'pre-workout',
    });
  }
  if (postWorkoutIndex >= 0) {
    anchors.set(postWorkoutIndex, {
      offset: offsetOf(addMinutes(workoutEnd, Math.max(0, prefs.postWorkoutMinutes))),
      reason: 'post-workout',
    });
  }
  ordered.forEach((meal, index) => {
    if (meal.manualTime) anchors.set(index, { offset: offsetOf(meal.manualTime), reason: 'manual' });
  });

  /*
   * Drop anchors the day cannot reach.
   *
   * Offsets are measured forwards from the first meal, so a workout that starts
   * *before* eating does — training at 06:00 when the first meal is 08:00 —
   * measures as almost a full day away and would drag every later meal around
   * the clock. The same is true of an anchor with no room for the meals that
   * must precede it. Either way the anchor is not usable, so the meal is spaced
   * with the others and the user is told why.
   */
  const eatingWindowEnd = offsetOf(prefs.bedtime);
  for (const [index, anchor] of [...anchors.entries()]) {
    if (index === 0) continue;
    const roomNeeded = index * MIN_GAP_MINUTES;
    if (anchor.offset >= roomNeeded && anchor.offset <= eatingWindowEnd) continue;

    anchors.delete(index);
    const name = ordered[index]!.name;
    warnings.push(
      anchor.reason === 'manual'
        ? `The time pinned on ${name} falls outside your eating day, so it was ignored.`
        : `Your ${workoutStart} workout leaves no room to place ${name} ${
            anchor.reason === 'pre-workout' ? 'before' : 'after'
          } it, so it was spaced with the other meals instead.`,
    );
  }

  /*
   * Aim the last meal at its window.
   *
   * Without this the final meal simply lands one interval after the one before
   * it, which on a late training day is well past midnight. The window pulls it
   * back into the evening; on a day that is running early it pushes it out
   * instead, so eating does not finish in the afternoon.
   */
  const lastIndex = ordered.length - 1;
  if (lastIndex > 0 && !anchors.has(lastIndex) && prefs.lastMealEarliest && prefs.lastMealLatest) {
    const earliest = offsetOf(prefs.lastMealEarliest);
    let latest = offsetOf(prefs.lastMealLatest);
    // A window that wraps back past the origin, e.g. 21:00–01:00 from 08:00.
    if (latest < earliest) latest += 24 * 60;

    const previousAnchorIndex = Math.max(...[...anchors.keys()].filter((i) => i < lastIndex));
    const previousAnchorOffset = anchors.get(previousAnchorIndex)!.offset;
    const natural = previousAnchorOffset + (lastIndex - previousAnchorIndex) * minInterval;

    anchors.set(lastIndex, {
      offset: Math.min(Math.max(natural, earliest), latest),
      reason: 'last-meal',
    });
  }

  const offsets = new Array<number>(ordered.length);
  const reasons = new Array<ScheduleReason>(ordered.length);

  // Walk the anchors in order, placing each and spreading the free meals that
  // sit between it and the anchor before it.
  const placedAnchors: number[] = [];
  let previousIndex = -1;
  let previousOffset = 0;

  for (const index of [...anchors.keys()].sort((a, b) => a - b)) {
    placedAnchors.push(index);
    const anchor = anchors.get(index)!;
    let offset = anchor.offset;

    if (previousIndex >= 0) {
      // Every meal in between still needs room to exist.
      const floor = previousOffset + (index - previousIndex) * MIN_GAP_MINUTES;
      if (offset < floor) {
        warnings.push(
          `${ordered[index]!.name} could not sit at its ${REASON_LABELS[anchor.reason]} time ` +
            `without crowding the meals before it, so it was pushed later.`,
        );
        offset = floor;
      }
    }

    offsets[index] = offset;
    reasons[index] = anchor.reason;

    const span = index - previousIndex;
    if (previousIndex >= 0 && span > 1) {
      const step = (offset - previousOffset) / span;
      for (let k = 1; k < span; k += 1) {
        offsets[previousIndex + k] = previousOffset + step * k;
        reasons[previousIndex + k] = 'interval';
      }
    }

    previousIndex = index;
    previousOffset = offset;
  }

  // Anything past the final anchor has nothing to stretch towards, so it falls
  // on the shortest comfortable gap.
  for (let i = previousIndex + 1; i < ordered.length; i += 1) {
    offsets[i] = offsets[i - 1]! + minInterval;
    reasons[i] = 'interval';
  }

  // Bedtime guard: the last meal should finish before bed.
  const bedtimeOffset = offsetOf(prefs.bedtime);
  const lastOffset = offsets[offsets.length - 1]!;
  const latestAllowed = bedtimeOffset - Math.max(0, prefs.mealDurationMinutes);

  if (lastOffset > latestAllowed && latestAllowed > 0) {
    const lastAnchorIndex = Math.max(
      0,
      ...[...anchors.keys()].filter((i) => i < offsets.length - 1),
    );
    const start = offsets[lastAnchorIndex]!;
    const tail = offsets.length - 1 - lastAnchorIndex;
    const room = latestAllowed - start;

    if (tail > 0 && room >= tail * MIN_GAP_MINUTES) {
      const gap = room / tail;
      for (let i = 1; i <= tail; i += 1) {
        offsets[lastAnchorIndex + i] = start + gap * i;
        reasons[lastAnchorIndex + i] = 'compressed-for-bedtime';
      }
      warnings.push(
        `Meals after ${ordered[lastAnchorIndex]!.name} were brought closer together so the last meal finishes before ${prefs.bedtime}.`,
      );
    } else {
      warnings.push(
        `The last meal lands after your ${prefs.bedtime} bedtime. Consider an earlier first meal, a shorter interval, or fewer meals.`,
      );
    }
  }

  /*
   * Report gaps that land outside the comfortable band.
   *
   * Spreading closes most holes on its own, but it cannot invent meals: five
   * meals cannot cover 08:00 to a 20:00 workout at four hours apart no matter
   * how they are arranged. What is left is arithmetic rather than a bug, and it
   * is worth saying out loud instead of leaving the user to notice.
   */
  for (let a = 1; a < placedAnchors.length; a += 1) {
    const from = placedAnchors[a - 1]!;
    const to = placedAnchors[a]!;
    // Meals inside a segment are evenly spread, so one gap describes them all.
    const gap = (offsets[to]! - offsets[from]!) / (to - from);

    // The pre- to post-workout gap is preWorkout + session + postWorkout by
    // construction. It cannot be spaced any other way, so reporting it every
    // single day would be noise rather than news.
    if (reasons[from] === 'pre-workout' && reasons[to] === 'post-workout') continue;

    const tooLong = gap > maxInterval + GAP_TOLERANCE_MINUTES;
    const tooShort = gap < minInterval - GAP_TOLERANCE_MINUTES;
    if (!tooLong && !tooShort) continue;

    const span =
      to - from === 1
        ? `${ordered[from]!.name} and ${ordered[to]!.name} sit`
        : `${ordered[from]!.name} through ${ordered[to]!.name} sit`;
    const bound = tooLong
      ? `longer than your maximum of ${formatGapHours(maxInterval)}`
      : `tighter than your minimum of ${formatGapHours(minInterval)}`;

    warnings.push(
      `${span} ${formatGapHours(gap)} apart, ${bound}. ` +
        `${describeAnchor(reasons[from]!, reasons[to]!, ordered[from]!.name, ordered[to]!.name)}`,
    );
  }

  const scheduled: ScheduledMeal[] = ordered.map((meal, index) => {
    const time = addMinutes(origin, Math.round(offsets[index]!));
    return {
      mealId: meal.id,
      name: meal.name,
      time,
      windowMinutes: meal.windowMinutes ?? null,
      reason: reasons[index]!,
      label: formatTimeRange(time, meal.windowMinutes),
    };
  });

  return { meals: scheduled, workoutStart, workoutEnd, warnings };
}

/** Which end of an awkward gap is pinned, so the user knows what to move. */
function describeAnchor(
  before: ScheduleReason,
  after: ScheduleReason,
  beforeName: string,
  afterName: string,
): string {
  const isPinned = (reason: ScheduleReason) =>
    reason === 'pre-workout' ||
    reason === 'post-workout' ||
    reason === 'last-meal' ||
    reason === 'manual';

  if (after === 'pre-workout') {
    return `${afterName} is held ahead of your workout — training earlier, or starting the day later, would close it.`;
  }
  if (before === 'post-workout' && isPinned(after)) {
    return `${beforeName} is held after your workout and ${afterName} is pinned too, so only your workout time or your meal count can change this.`;
  }
  if (after === 'post-workout') return `${afterName} is held until after your workout.`;
  if (before === 'post-workout') return `${beforeName} is held until after your workout.`;
  if (after === 'last-meal') return `${afterName} is held inside your last-meal window.`;
  if (after === 'manual') return `${afterName} is pinned by hand.`;
  if (before === 'manual') return `${beforeName} is pinned by hand.`;
  return `${afterName} sits between two fixed points.`;
}

/**
 * "Meal 1 slipped to 2pm — move everything else too."
 *
 * Keeps the gaps the user already had rather than regenerating from
 * preferences, so a hand-tuned schedule survives a late start.
 */
export function shiftScheduleFrom(
  meals: readonly ScheduledMeal[],
  mealId: string,
  newTime: string,
): ScheduledMeal[] {
  const index = meals.findIndex((m) => m.mealId === mealId);
  if (index === -1) return [...meals];

  const delta = timeToMinutes(newTime) - timeToMinutes(meals[index]!.time);
  if (delta === 0) return [...meals];

  return meals.map((meal, i) => {
    if (i < index) return meal;
    const time = i === index ? newTime : addMinutes(meal.time, delta);
    return {
      ...meal,
      time,
      reason: i === index ? ('manual' as const) : meal.reason,
      label: formatTimeRange(time, meal.windowMinutes),
    };
  });
}

/**
 * The next meal that still needs eating, and how far away it is.
 * Meals already completed or skipped are ignored.
 */
export function findNextMeal<T extends { scheduledTime?: string | null; status: string; sortOrder: number }>(
  meals: readonly T[],
  nowTime: string,
): { meal: T; minutesAway: number } | null {
  const candidates = meals
    .filter((m) => m.status === 'PENDING' && m.scheduledTime)
    .map((meal) => ({ meal, minutesAway: minutesUntil(nowTime, meal.scheduledTime!) }));

  if (candidates.length === 0) return null;

  // Prefer the soonest upcoming meal; if all are behind us, the earliest overdue
  // one (largest minutesUntil, i.e. furthest around the clock) is the one to eat.
  const upcoming = candidates.filter((c) => c.minutesAway <= 12 * 60);
  const pool = upcoming.length > 0 ? upcoming : candidates;
  return pool.reduce((best, current) => (current.minutesAway < best.minutesAway ? current : best));
}

/** Meals whose time has passed but which are still pending. */
export function findOverdueMeals<T extends { scheduledTime?: string | null; status: string }>(
  meals: readonly T[],
  nowTime: string,
  graceMinutes = 15,
): T[] {
  const now = timeToMinutes(nowTime);
  return meals.filter((meal) => {
    if (meal.status !== 'PENDING' || !meal.scheduledTime) return false;
    const scheduled = timeToMinutes(meal.scheduledTime);
    // Times more than 12h ahead are treated as belonging to the previous night.
    return scheduled + graceMinutes < now && now - scheduled < 12 * 60;
  });
}
