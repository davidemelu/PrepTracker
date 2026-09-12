import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFixture, resetDatabase, testPrisma, type Fixture } from './helpers';
import { addDays, todayKey } from '@/lib/domain/dates';

/**
 * Adherence reporting.
 *
 * The case worth guarding: a day exists as soon as it is opened — and Next
 * prefetches the "Tomorrow" link on the Today screen, so tomorrow gets
 * materialised without you doing anything. Counting it would score every meal
 * you have not eaten yet as missed.
 */

let fixture: Fixture;
let analytics: typeof import('@/lib/queries/analytics');
let dayService: typeof import('@/lib/server/day-service');

beforeAll(async () => {
  analytics = await import('@/lib/queries/analytics');
  dayService = await import('@/lib/server/day-service');
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
});

/** Generates a day and marks every meal on it as eaten. */
async function completeDay(date: string) {
  const id = await dayService.ensureDailyPlan(fixture.userId, date);
  await testPrisma().dailyMeal.updateMany({
    where: { dailyPlanId: id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  await testPrisma().dailySupplement.updateMany({
    where: { dailyPlanId: id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  return id;
}

describe('getPeriodStats', () => {
  it('ignores days in the future', async () => {
    const today = todayKey();
    const tomorrow = addDays(today, 1);

    await completeDay(today);
    // Merely opening tomorrow materialises it, with nothing completed.
    await dayService.ensureDailyPlan(fixture.userId, tomorrow);

    const stats = await analytics.getPeriodStats(fixture.userId, addDays(today, -3), addDays(today, 3));

    // Only today counts, and today was perfect.
    expect(stats.trackedDays).toBe(1);
    expect(stats.mealPercent).toBe(100);
    expect(stats.missedMeals).toBe(0);
    expect(stats.plannedMeals).toBe(2);
  });

  it('counts today and earlier days normally', async () => {
    const today = todayKey();
    const yesterday = addDays(today, -1);

    await completeDay(yesterday);
    // Today is generated but nothing is completed on it.
    await dayService.ensureDailyPlan(fixture.userId, today);

    const stats = await analytics.getPeriodStats(fixture.userId, addDays(today, -3), today);

    expect(stats.trackedDays).toBe(2);
    // Yesterday's meals were eaten, today's were not.
    expect(stats.completedMeals).toBe(2);
    expect(stats.plannedMeals).toBe(4);
    expect(stats.mealPercent).toBe(50);
  });

  it('does not count a future day as a missed meal in the breakdown', async () => {
    const today = todayKey();
    await completeDay(today);
    await dayService.ensureDailyPlan(fixture.userId, addDays(today, 2));

    const rows = await analytics.getMealCompletionBreakdown(
      fixture.userId,
      addDays(today, -7),
      addDays(today, 7),
    );

    for (const row of rows) {
      expect(row.planned).toBe(1);
      expect(row.percent).toBe(100);
    }
  });

  it('excludes future supplements from adherence', async () => {
    const today = todayKey();
    await completeDay(today);
    await dayService.ensureDailyPlan(fixture.userId, addDays(today, 1));

    const rows = await analytics.getSupplementAdherence(
      fixture.userId,
      addDays(today, -7),
      addDays(today, 7),
    );

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.percent).toBe(100);
    }
  });

  it('leaves the water trend free of future days', async () => {
    const today = todayKey();
    await dayService.ensureDailyPlan(fixture.userId, today);
    await dayService.ensureDailyPlan(fixture.userId, addDays(today, 1));

    const points = await analytics.getWaterTrend(fixture.userId, addDays(today, -3), addDays(today, 3));
    expect(points.map((p) => p.date)).toEqual([today]);
  });

  it('reports no tracked days when nothing has been opened', async () => {
    const today = todayKey();
    const stats = await analytics.getPeriodStats(fixture.userId, addDays(today, -7), today);

    expect(stats.trackedDays).toBe(0);
    // Nothing planned means nothing missed, not 0% adherence.
    expect(stats.overallPercent).toBe(100);
    expect(stats.plannedMeals).toBe(0);
  });
});

describe('getDayRows', () => {
  it('still returns future days so the weekly tracker can show them', async () => {
    const today = todayKey();
    const tomorrow = addDays(today, 1);
    await dayService.ensureDailyPlan(fixture.userId, tomorrow);

    const rows = await analytics.getDayRows(fixture.userId, today, addDays(today, 2));
    const tomorrowRow = rows.find((r) => r.date === tomorrow)!;

    // Present and marked as existing — the page decides how to display it.
    expect(tomorrowRow.exists).toBe(true);
    expect(tomorrowRow.meals.length).toBeGreaterThan(0);
  });

  it('marks dates that were never opened as not tracked', async () => {
    const today = todayKey();
    const rows = await analytics.getDayRows(fixture.userId, addDays(today, -2), today);
    expect(rows.every((r) => !r.exists)).toBe(true);
  });
});
