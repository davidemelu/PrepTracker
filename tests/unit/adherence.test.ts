import { describe, expect, it } from 'vitest';
import {
  adherenceBand,
  completionByMeal,
  completionRatio,
  dayAdherence,
  weekStats,
  type DaySummary,
} from '@/lib/domain/adherence';

const meal = (name: string, sortOrder: number, status: 'PENDING' | 'COMPLETED' | 'SKIPPED') => ({
  name,
  sortOrder,
  status,
});

describe('completionRatio', () => {
  it('counts only completed items', () => {
    const ratio = completionRatio([
      { status: 'COMPLETED' },
      { status: 'SKIPPED' },
      { status: 'PENDING' },
      { status: 'COMPLETED' },
    ]);
    expect(ratio).toEqual({ completed: 2, total: 4, percent: 50 });
  });

  it('treats an empty list as fully adhered rather than zero', () => {
    expect(completionRatio([]).percent).toBe(100);
  });
});

describe('dayAdherence', () => {
  it('averages the three tracked areas', () => {
    const result = dayAdherence({
      meals: [meal('Meal 1', 0, 'COMPLETED'), meal('Meal 2', 1, 'PENDING')],
      supplements: [{ status: 'COMPLETED' }, { status: 'COMPLETED' }],
      waterMl: 2000,
      waterTargetMl: 4000,
    });
    // meals 50, supplements 100, water 50 -> 66.7
    expect(result.overallPercent).toBe(66.7);
    expect(result.meals.percent).toBe(50);
    expect(result.water.percent).toBe(50);
  });

  it('counts a skipped meal against you', () => {
    const result = dayAdherence({
      meals: [meal('Meal 1', 0, 'COMPLETED'), meal('Meal 2', 1, 'SKIPPED')],
      supplements: [],
      waterMl: 4000,
      waterTargetMl: 4000,
    });
    expect(result.meals.percent).toBe(50);
  });

  it('caps water at 100% so overdrinking cannot offset missed meals', () => {
    const result = dayAdherence({
      meals: [meal('Meal 1', 0, 'PENDING')],
      supplements: [],
      waterMl: 12000,
      waterTargetMl: 4000,
    });
    expect(result.water.percent).toBe(100);
    expect(result.overallPercent).toBe(50);
  });

  it('ignores areas that do not exist for the day', () => {
    const result = dayAdherence({
      meals: [meal('Meal 1', 0, 'COMPLETED')],
      supplements: [],
      waterMl: 0,
      waterTargetMl: 0,
    });
    expect(result.overallPercent).toBe(100);
  });

  it('recognises a perfect day', () => {
    const result = dayAdherence({
      meals: [meal('Meal 1', 0, 'COMPLETED')],
      supplements: [{ status: 'COMPLETED' }],
      waterMl: 4000,
      waterTargetMl: 4000,
    });
    expect(result.isPerfectDay).toBe(true);
  });

  it('does not call an empty day perfect', () => {
    const result = dayAdherence({ meals: [], supplements: [], waterMl: 0, waterTargetMl: 0 });
    expect(result.isPerfectDay).toBe(false);
  });
});

const week: DaySummary[] = [
  {
    date: '2026-09-07',
    dayTypeName: 'Training',
    isTraining: true,
    meals: [meal('Meal 1', 0, 'COMPLETED'), meal('Meal 5', 4, 'COMPLETED')],
    supplements: [{ status: 'COMPLETED' }],
    waterMl: 4000,
    waterTargetMl: 4000,
  },
  {
    date: '2026-09-08',
    dayTypeName: 'Training',
    isTraining: true,
    meals: [meal('Meal 1', 0, 'COMPLETED'), meal('Meal 5', 4, 'SKIPPED')],
    supplements: [{ status: 'PENDING' }],
    waterMl: 2000,
    waterTargetMl: 4000,
  },
  {
    date: '2026-09-12',
    dayTypeName: 'Rest',
    isTraining: false,
    meals: [meal('Meal 1', 0, 'PENDING'), meal('Meal 5', 4, 'PENDING')],
    supplements: [{ status: 'COMPLETED' }],
    waterMl: 1000,
    waterTargetMl: 4000,
  },
];

describe('weekStats', () => {
  const stats = weekStats(week);

  it('reports meal, supplement and water percentages', () => {
    expect(stats.completedMeals).toBe(3);
    expect(stats.plannedMeals).toBe(6);
    expect(stats.mealPercent).toBe(50);
    expect(stats.supplementPercent).toBe(66.7);
    // 100 + 50 + 25 over three days.
    expect(stats.waterPercent).toBe(58.3);
  });

  it('counts perfect days', () => {
    expect(stats.perfectDays).toBe(1);
  });

  it('counts missed and skipped meals separately', () => {
    expect(stats.missedMeals).toBe(3);
    expect(stats.skippedMeals).toBe(1);
  });

  it('identifies the most frequently missed meal', () => {
    expect(stats.mostMissedMeal).toEqual({ name: 'Meal 5', misses: 2 });
  });

  it('averages daily water', () => {
    expect(stats.averageWaterMl).toBe(2333);
  });

  it('splits training and rest day adherence', () => {
    expect(stats.trainingDayPercent).toBeGreaterThan(stats.restDayPercent!);
    // The one rest day: meals 0%, supplements 100%, water 25% -> 41.7%.
    expect(stats.restDayPercent).toBeCloseTo(41.7, 1);
  });

  it('returns null for a split with no days', () => {
    const trainingOnly = weekStats(week.filter((d) => d.isTraining));
    expect(trainingOnly.restDayPercent).toBeNull();
  });

  it('handles an empty period without dividing by zero', () => {
    const empty = weekStats([]);
    expect(empty.overallPercent).toBe(100);
    expect(empty.mostMissedMeal).toBeNull();
    expect(empty.averageWaterMl).toBe(0);
  });
});

describe('completionByMeal', () => {
  it('reports the completion rate for each meal position', () => {
    const rows = completionByMeal(week);
    expect(rows.map((r) => r.name)).toEqual(['Meal 1', 'Meal 5']);
    expect(rows[0]).toMatchObject({ completed: 2, planned: 3, percent: 66.7 });
    expect(rows[1]).toMatchObject({ completed: 1, planned: 3, percent: 33.3 });
  });
});

describe('adherenceBand', () => {
  it('bands percentages for colour coding', () => {
    expect(adherenceBand(100)).toBe('great');
    expect(adherenceBand(85)).toBe('good');
    expect(adherenceBand(65)).toBe('ok');
    expect(adherenceBand(20)).toBe('poor');
  });
});
