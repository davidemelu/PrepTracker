import 'server-only';

import { prisma } from '@/lib/db';
import {
  addDays,
  dayRange,
  fromDbDate,
  toDayKey,
  toDbDate,
  todayKey,
  type DayKey,
} from '@/lib/domain/dates';
import { completionByMeal, weekStats, type DaySummary, type WeekStats } from '@/lib/domain/adherence';
import { focusFrequency, type DayWorkout, type WorkoutHistoryEntry } from '@/lib/domain/workout';
import { effectiveYield, type YieldObservation } from '@/lib/domain/yield';

/**
 * Read models for the weekly tracker, history and analytics.
 *
 * These read only stored journal rows: nothing is recomputed from the current
 * plan, so a plan edit today never changes what last month's chart shows.
 */

export interface DayMealTimes {
  name: string;
  sortOrder: number;
  status: string;
  scheduledTime: string | null;
  actualTime: string | null;
}

export interface DayRow extends DaySummary {
  exists: boolean;
  workoutTime: string | null;
  /** What was trained, snapshotted on the day itself. */
  workout: DayWorkout;
  /** Planned and actual times per meal, for the weekly view. */
  mealTimes: DayMealTimes[];
  notes: string | null;
}

/**
 * Days between two dates, with placeholders for dates that were never opened.
 * A day with no stored plan is genuinely "not tracked", not "0% adherence".
 */
export async function getDayRows(userId: string, from: DayKey, to: DayKey): Promise<DayRow[]> {
  const plans = await prisma.dailyPlan.findMany({
    where: { userId, date: { gte: toDbDate(from), lte: toDbDate(to) } },
    include: {
      meals: {
        select: {
          name: true,
          sortOrder: true,
          status: true,
          scheduledTime: true,
          actualTime: true,
        },
        orderBy: { sortOrder: 'asc' },
      },
      supplements: { select: { status: true } },
      waterEntries: { select: { amountMl: true } },
      workoutFocuses: { orderBy: { sortOrder: 'asc' }, select: { name: true } },
    },
    orderBy: { date: 'asc' },
  });

  const byDate = new Map(plans.map((plan) => [fromDbDate(plan.date), plan]));

  return dayRange(from, to).map((date) => {
    const plan = byDate.get(date);
    if (!plan) {
      return {
        date,
        dayTypeName: '—',
        isTraining: false,
        meals: [],
        supplements: [],
        waterMl: 0,
        waterTargetMl: 0,
        exists: false,
        workoutTime: null,
        workout: { workoutName: null, focusNames: [] },
        mealTimes: [],
        notes: null,
      };
    }

    return {
      date,
      dayTypeName: plan.dayTypeName,
      isTraining: plan.dayTypeIsTraining,
      meals: plan.meals,
      supplements: plan.supplements,
      waterMl: plan.waterEntries.reduce((sum, e) => sum + e.amountMl, 0),
      waterTargetMl: plan.waterTargetMl,
      exists: true,
      workoutTime: plan.workoutTime,
      workout: {
        workoutName: plan.workoutName,
        focusNames: plan.workoutFocuses.map((f) => f.name),
      },
      mealTimes: plan.meals.map((meal) => ({
        name: meal.name,
        sortOrder: meal.sortOrder,
        status: meal.status,
        scheduledTime: meal.scheduledTime,
        actualTime: meal.actualTime,
      })),
      notes: plan.notes,
    };
  });
}

export interface PeriodStats extends WeekStats {
  trackedDays: number;
  totalDays: number;
}

/**
 * Days that actually happened: stored, and not in the future.
 *
 * A day only has to exist to be stored — merely opening tomorrow, or letting
 * Next prefetch the "Tomorrow" link, materialises it. What is reported about
 * those days would be entirely blank.
 *
 * This is the right filter for anything that reports a fact: how much water was
 * drunk, what was trained, how a day felt. Today belongs in all of those the
 * moment it starts.
 */
function trackedDays(rows: readonly DayRow[], today: DayKey): DayRow[] {
  return rows.filter((row) => row.exists && row.date <= today);
}

/**
 * Days that can be scored. Everything above, and today only once it is over.
 *
 * At nine in the morning four of the day's five meals have not happened yet.
 * Counting them as missed made adherence worse the earlier in the day you
 * looked at it, and pulled the week's average down with it. Today joins the
 * scoring once nothing on it is still pending — which is also the moment its
 * score stops moving on its own.
 */
function scoredDays(rows: readonly DayRow[], today: DayKey): DayRow[] {
  return trackedDays(rows, today).filter((row) => {
    if (row.date < today) return true;
    return (
      row.meals.every((meal) => meal.status !== 'PENDING') &&
      row.supplements.every((dose) => dose.status !== 'PENDING')
    );
  });
}

export async function getPeriodStats(userId: string, from: DayKey, to: DayKey): Promise<PeriodStats> {
  const rows = await getDayRows(userId, from, to);
  const today = todayKey();
  const countable = scoredDays(rows, today);

  return {
    ...weekStats(countable),
    trackedDays: countable.length,
    totalDays: rows.filter((row) => row.date <= today).length,
  };
}

export interface WaterPoint {
  date: DayKey;
  totalMl: number;
  targetMl: number;
}

export async function getWaterTrend(userId: string, from: DayKey, to: DayKey): Promise<WaterPoint[]> {
  const rows = trackedDays(await getDayRows(userId, from, to), todayKey());
  return rows.map((row) => ({ date: row.date, totalMl: row.waterMl, targetMl: row.waterTargetMl }));
}

export interface AdherencePoint {
  label: string;
  weekStart: DayKey;
  meals: number;
  supplements: number;
  water: number;
  overall: number;
}

/** Adherence per week, for the trend chart. */
export async function getWeeklyAdherence(
  userId: string,
  weeks: number,
  endDate: DayKey,
): Promise<AdherencePoint[]> {
  const points: AdherencePoint[] = [];

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const weekStart = addDays(endDate, -7 * i - 6);
    const weekEnd = addDays(weekStart, 6);
    const rows = scoredDays(await getDayRows(userId, weekStart, weekEnd), todayKey());
    if (rows.length === 0) continue;

    const stats = weekStats(rows);
    points.push({
      label: weekStart.slice(5),
      weekStart,
      meals: stats.mealPercent,
      supplements: stats.supplementPercent,
      water: stats.waterPercent,
      overall: stats.overallPercent,
    });
  }

  return points;
}

export async function getMealCompletionBreakdown(userId: string, from: DayKey, to: DayKey) {
  const rows = scoredDays(await getDayRows(userId, from, to), todayKey());
  return completionByMeal(rows);
}

export interface SupplementAdherenceRow {
  name: string;
  completed: number;
  planned: number;
  percent: number;
}

export async function getSupplementAdherence(
  userId: string,
  from: DayKey,
  to: DayKey,
): Promise<SupplementAdherenceRow[]> {
  // Future days are excluded here too: a dose you have not reached yet is not
  // a dose you missed.
  const today = todayKey();
  const doses = await prisma.dailySupplement.findMany({
    where: {
      dailyPlan: {
        userId,
        date: { gte: toDbDate(from), lte: toDbDate(to < today ? to : today) },
      },
    },
    select: { name: true, status: true },
  });

  const byName = new Map<string, { completed: number; planned: number }>();
  for (const dose of doses) {
    const entry = byName.get(dose.name) ?? { completed: 0, planned: 0 };
    entry.planned += 1;
    if (dose.status === 'COMPLETED') entry.completed += 1;
    byName.set(dose.name, entry);
  }

  return [...byName.entries()]
    .map(([name, entry]) => ({
      name,
      ...entry,
      percent: entry.planned === 0 ? 0 : Math.round((entry.completed / entry.planned) * 1000) / 10,
    }))
    .sort((a, b) => a.percent - b.percent);
}

export interface YieldPoint {
  foodName: string;
  points: Array<{ date: string; yieldPct: number; source: string }>;
  averagePct: number;
  currentPct: number | null;
}

/** Measured yield over time, per protein. */
export async function getYieldHistory(userId: string): Promise<YieldPoint[]> {
  const rows = await prisma.cookingYield.findMany({
    where: { userId },
    orderBy: { recordedAt: 'asc' },
    include: { food: { select: { cookingYieldPct: true } } },
  });

  const byFood = new Map<string, YieldPoint>();

  for (const row of rows) {
    const entry = byFood.get(row.foodName) ?? {
      foodName: row.foodName,
      points: [],
      averagePct: 0,
      currentPct: row.food?.cookingYieldPct ?? null,
    };
    entry.points.push({
      // Local, not UTC: a batch weighed at 20:00 in Vancouver belongs to that
      // evening, not to the next calendar day the UTC slice would give it.
      date: toDayKey(row.recordedAt),
      yieldPct: row.yieldPct,
      source: row.source,
    });
    entry.currentPct = row.food?.cookingYieldPct ?? entry.currentPct;
    byFood.set(row.foodName, entry);
  }

  return [...byFood.values()]
    .map((entry) => ({
      ...entry,
      // The same rule that sets the food's own yield, so History and Prep
      // cannot show two different averages for the same protein.
      averagePct:
        effectiveYield(
          entry.points.map((point) => ({
            yieldPct: point.yieldPct,
            recordedAt: point.date,
            source: point.source as YieldObservation['source'],
          })),
          entry.currentPct,
        ) ?? 0,
    }))
    .sort((a, b) => a.foodName.localeCompare(b.foodName));
}

/**
 * Which focuses were trained over a period, most frequent first. Rest days and
 * training days with nothing recorded are ignored.
 */
export async function getWorkoutFrequency(
  userId: string,
  from: DayKey,
  to: DayKey,
): Promise<Array<{ name: string; sessions: number }>> {
  const rows = trackedDays(await getDayRows(userId, from, to), todayKey());

  const entries: WorkoutHistoryEntry[] = rows.map((row) => ({
    date: row.date,
    isTraining: row.isTraining,
    workout: row.workout,
  }));

  return focusFrequency(entries);
}

/** Check-in ratings over time. */
export async function getCheckInHistory(userId: string, from: DayKey, to: DayKey) {
  const checkIns = await prisma.dailyCheckIn.findMany({
    where: { dailyPlan: { userId, date: { gte: toDbDate(from), lte: toDbDate(to) } } },
    include: { dailyPlan: { select: { date: true, dayTypeName: true } } },
    orderBy: { dailyPlan: { date: 'asc' } },
  });

  return checkIns.map((checkIn) => ({
    date: fromDbDate(checkIn.dailyPlan.date),
    dayTypeName: checkIn.dailyPlan.dayTypeName,
    hunger: checkIn.ratingHunger,
    energy: checkIn.ratingEnergy,
    training: checkIn.ratingTraining,
    adherence: checkIn.ratingAdherence,
    notes: checkIn.notes,
    digestionNote: checkIn.digestionNote,
    workoutNote: checkIn.workoutNote,
    mealDifficultyNote: checkIn.mealDifficultyNote,
    prepIssueNote: checkIn.prepIssueNote,
  }));
}

export async function getHistoryLists(userId: string) {
  const [groceryWeeks, prepSessions] = await Promise.all([
    prisma.groceryWeek.findMany({
      where: { userId },
      orderBy: { startDate: 'desc' },
      take: 30,
      include: { items: { select: { purchased: true, haveAlready: true } } },
    }),
    prisma.prepSession.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 30,
      include: { batches: { select: { foodName: true, measuredYieldPct: true, portionsMade: true } } },
    }),
  ]);

  return {
    groceryWeeks: groceryWeeks.map((week) => ({
      id: week.id,
      name: week.name,
      startDate: fromDbDate(week.startDate),
      endDate: fromDbDate(week.endDate),
      status: week.status,
      total: week.items.length,
      done: week.items.filter((i) => i.purchased || i.haveAlready).length,
    })),
    prepSessions: prepSessions.map((session) => ({
      id: session.id,
      name: session.name,
      date: fromDbDate(session.date),
      status: session.status,
      daysCovered: session.daysCovered,
      batches: session.batches.map((b) => ({
        foodName: b.foodName,
        measuredYieldPct: b.measuredYieldPct,
        portionsMade: b.portionsMade,
      })),
    })),
  };
}
