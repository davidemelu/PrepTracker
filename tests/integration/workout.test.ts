import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFixture, resetDatabase, testPrisma, type Fixture } from './helpers';

/**
 * Workout tracking and actual meal times, against a real database.
 *
 * The behaviours guarded here are the ones the feature exists for: training and
 * rest days driving portions, multiple body parts per session, custom session
 * names, automatic completion timestamps, correcting a time after the fact, and
 * history that survives the catalogue changing underneath it.
 */

const session = vi.hoisted(() => ({ userId: '' }));

vi.mock('@/lib/auth/guards', () => ({
  requireUserId: async () => session.userId,
  requireUser: async () => ({ id: session.userId, username: 'tester', displayName: null, mustChangePassword: false }),
  getCurrentUser: async () => ({ id: session.userId, username: 'tester', displayName: null, mustChangePassword: false }),
}));

vi.mock('next/cache', () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}));

let fixture: Fixture;
let workout: typeof import('@/lib/actions/workout');
let dayActions: typeof import('@/lib/actions/day');
let dayService: typeof import('@/lib/server/day-service');
let dayQueries: typeof import('@/lib/queries/day');
let analytics: typeof import('@/lib/queries/analytics');

/** Focus ids created for the fixture user, filled in by beforeEach. */
const focus = {} as Record<string, string> & Record<'Chest' | 'Back' | 'Triceps' | 'Biceps' | 'Legs' | 'Cardio', string>;

beforeAll(async () => {
  workout = await import('@/lib/actions/workout');
  dayActions = await import('@/lib/actions/day');
  dayService = await import('@/lib/server/day-service');
  dayQueries = await import('@/lib/queries/day');
  analytics = await import('@/lib/queries/analytics');
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await createFixture();
  session.userId = fixture.userId;

  const names = ['Chest', 'Back', 'Triceps', 'Biceps', 'Legs', 'Cardio'];
  for (const [index, name] of names.entries()) {
    const row = await testPrisma().workoutFocus.create({
      data: {
        userId: fixture.userId,
        name,
        category: name === 'Cardio' ? 'CONDITIONING' : 'MUSCLE_GROUP',
        sortOrder: index,
      },
    });
    focus[name] = row.id;
  }
});

/* -------------------------------------------------------------------------- */
/* 1. Training / rest portion switching                                        */
/* -------------------------------------------------------------------------- */

describe('training and rest day portions', () => {
  it('uses training quantities on a training day', async () => {
    // 2026-09-14 is a Monday: training in the fixture schedule.
    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');

    expect(view.isTraining).toBe(true);
    expect(view.dayTypeName).toBe('Training');

    const rice = view.meals[0]!.items.find((i) => i.foodName === 'White rice')!;
    expect(rice.quantity).toBe(225);
  });

  it('switches to rest quantities on a rest day', async () => {
    // 2026-09-19 is a Saturday: rest.
    const view = await dayQueries.getDayView(fixture.userId, '2026-09-19');

    expect(view.isTraining).toBe(false);
    const rice = view.meals[0]!.items.find((i) => i.foodName === 'White rice')!;
    expect(rice.quantity).toBe(175);

    // Meal B drops rice entirely on a rest day.
    expect(view.meals[1]!.items.map((i) => i.foodName)).toEqual(['Bagels']);
  });

  it('re-portions the day when today is switched to rest by hand', async () => {
    const before = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(before.meals[0]!.items.find((i) => i.foodName === 'White rice')!.quantity).toBe(225);

    const result = await dayActions.setDayType({ date: '2026-09-14', dayTypeId: fixture.restId });
    expect(result.ok).toBe(true);

    const after = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(after.isTraining).toBe(false);
    expect(after.meals[0]!.items.find((i) => i.foodName === 'White rice')!.quantity).toBe(175);
  });

  it('takes the quantities from the plan, not from a hard-coded rule', async () => {
    // Change the plan's rest-day quantity and regenerate: the day must follow.
    const ingredient = await testPrisma().mealIngredient.findFirstOrThrow({
      where: { mealId: fixture.mealIds.mealA, foodId: fixture.foods.rice },
    });
    await testPrisma().mealIngredientQuantity.update({
      where: {
        mealIngredientId_dayTypeId: { mealIngredientId: ingredient.id, dayTypeId: fixture.restId },
      },
      data: { quantity: 99 },
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-19', { regenerate: true });
    const view = await dayQueries.getDayView(fixture.userId, '2026-09-19');
    expect(view.meals[0]!.items.find((i) => i.foodName === 'White rice')!.quantity).toBe(99);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Workout / body part tracking                                             */
/* -------------------------------------------------------------------------- */

describe('recording a workout', () => {
  it('accepts multiple body parts', async () => {
    const result = await workout.setDayWorkout({
      date: '2026-09-14',
      focusIds: [focus.Chest, focus.Triceps],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.focusCount).toBe(2);

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(view.workout.focusNames).toEqual(['Chest', 'Triceps']);
  });

  it('stores focuses in catalogue order, not tap order', async () => {
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Triceps, focus.Chest] });

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(view.workout.focusNames).toEqual(['Chest', 'Triceps']);
  });

  it('accepts a custom session name on its own', async () => {
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [], workoutName: 'Upper A' });

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(view.workout.workoutName).toBe('Upper A');
    expect(view.workout.focusNames).toEqual([]);
  });

  it('accepts a custom name together with body parts', async () => {
    await workout.setDayWorkout({
      date: '2026-09-14',
      focusIds: [focus.Back, focus.Biceps],
      workoutName: 'Pull 1',
    });

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(view.workout.workoutName).toBe('Pull 1');
    expect(view.workout.focusNames).toEqual(['Back', 'Biceps']);
  });

  it('replaces the previous selection rather than appending', async () => {
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Chest, focus.Triceps] });
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Legs] });

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(view.workout.focusNames).toEqual(['Legs']);
    expect(await testPrisma().dailyWorkoutFocus.count()).toBe(1);
  });

  it('clears a workout', async () => {
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Chest], workoutName: 'A' });
    await workout.clearDayWorkout({ date: '2026-09-14' });

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(view.workout.focusNames).toEqual([]);
    expect(view.workout.workoutName).toBeNull();
  });

  it('rejects a focus that belongs to someone else', async () => {
    const other = await testPrisma().user.create({
      data: { username: 'other', passwordHash: 'x' },
    });
    const theirFocus = await testPrisma().workoutFocus.create({
      data: { userId: other.id, name: 'Not mine' },
    });

    const result = await workout.setDayWorkout({ date: '2026-09-14', focusIds: [theirFocus.id] });
    expect(result.ok).toBe(false);
  });

  it('rejects a name that is far too long', async () => {
    const result = await workout.setDayWorkout({
      date: '2026-09-14',
      focusIds: [],
      workoutName: 'x'.repeat(200),
    });
    expect(result.ok).toBe(false);
  });
});

describe('weekly workout defaults', () => {
  it('applies the weekday default to a newly generated day', async () => {
    // Monday = Chest + Triceps, called "Push 1".
    const result = await workout.setScheduledWorkout({
      dayOfWeek: 1,
      focusIds: [focus.Chest, focus.Triceps],
      workoutName: 'Push 1',
    });
    expect(result.ok).toBe(true);

    // 2026-09-21 is a Monday that has never been opened.
    const view = await dayQueries.getDayView(fixture.userId, '2026-09-21');
    expect(view.workout.workoutName).toBe('Push 1');
    expect(view.workout.focusNames).toEqual(['Chest', 'Triceps']);
  });

  it('does not rewrite a day that already exists', async () => {
    await dayQueries.getDayView(fixture.userId, '2026-09-21');
    await workout.setDayWorkout({ date: '2026-09-21', focusIds: [focus.Legs] });

    await workout.setScheduledWorkout({
      dayOfWeek: 1,
      focusIds: [focus.Chest, focus.Triceps],
      workoutName: 'Push 1',
    });

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-21');
    expect(view.workout.focusNames).toEqual(['Legs']);
  });

  it('can be applied to an existing day on request', async () => {
    await dayQueries.getDayView(fixture.userId, '2026-09-21');
    await workout.setScheduledWorkout({
      dayOfWeek: 1,
      focusIds: [focus.Chest, focus.Triceps],
      workoutName: 'Push 1',
    });

    const result = await workout.applyScheduledWorkout({ date: '2026-09-21' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.applied).toBe(true);

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-21');
    expect(view.workout.focusNames).toEqual(['Chest', 'Triceps']);
  });

  it('says so when no default is configured', async () => {
    const result = await workout.applyScheduledWorkout({ date: '2026-09-21' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.applied).toBe(false);
  });
});

describe('workout history survives catalogue changes', () => {
  it('keeps the recorded name when a focus is renamed', async () => {
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Chest] });

    await workout.saveWorkoutFocus({
      id: focus.Chest,
      name: 'Upper chest',
      category: 'MUSCLE_GROUP',
      active: true,
    });

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(view.workout.focusNames).toEqual(['Chest']);
  });

  it('keeps the recorded name when a focus is deleted', async () => {
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Chest, focus.Triceps] });

    const result = await workout.deleteWorkoutFocus({ id: focus.Chest });
    expect(result.ok).toBe(true);

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(view.workout.focusNames).toEqual(['Chest', 'Triceps']);

    // The link is dropped, the snapshot is not.
    const row = await testPrisma().dailyWorkoutFocus.findFirstOrThrow({ where: { name: 'Chest' } });
    expect(row.focusId).toBeNull();
  });

  it('survives a day being regenerated', async () => {
    await workout.setDayWorkout({
      date: '2026-09-14',
      focusIds: [focus.Back, focus.Biceps],
      workoutName: 'Pull 1',
    });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', { regenerate: true });

    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(view.workout.focusNames).toEqual(['Back', 'Biceps']);
    expect(view.workout.workoutName).toBe('Pull 1');
  });

  it('rejects a duplicate focus name in the catalogue', async () => {
    const result = await workout.saveWorkoutFocus({
      name: 'Chest',
      category: 'MUSCLE_GROUP',
      active: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/already have a workout focus/);
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Actual meal times                                                        */
/* -------------------------------------------------------------------------- */

describe('actual meal times', () => {
  async function firstMeal(date = '2026-09-14') {
    const view = await dayQueries.getDayView(fixture.userId, date);
    return view.meals[0]!;
  }

  it('records the time automatically on completion, keeping the planned time', async () => {
    const meal = await firstMeal();
    expect(meal.scheduledTime).toBe('13:00');
    expect(meal.actualTime).toBeNull();

    await dayActions.completeMeal({ dailyMealId: meal.id });

    const after = await testPrisma().dailyMeal.findUniqueOrThrow({ where: { id: meal.id } });
    expect(after.status).toBe('COMPLETED');
    expect(after.actualTime).toMatch(/^\d{2}:\d{2}$/);
    expect(after.completedAt).toBeInstanceOf(Date);
    // The plan's intent is untouched.
    expect(after.scheduledTime).toBe('13:00');
  });

  it('allows correcting the time after the fact', async () => {
    const meal = await firstMeal();
    await dayActions.completeMeal({ dailyMealId: meal.id });

    const result = await dayActions.setMealActualTime({
      dailyMealId: meal.id,
      actualTime: '13:47',
    });
    expect(result.ok).toBe(true);

    const after = await testPrisma().dailyMeal.findUniqueOrThrow({ where: { id: meal.id } });
    expect(after.actualTime).toBe('13:47');
    expect(after.scheduledTime).toBe('13:00');
    expect(after.status).toBe('COMPLETED');
  });

  it('marks a meal eaten when a time is set for one not yet completed', async () => {
    const meal = await firstMeal();
    expect(meal.status).toBe('PENDING');

    await dayActions.setMealActualTime({
      dailyMealId: meal.id,
      actualTime: '12:15',
      markCompleted: true,
    });

    const after = await testPrisma().dailyMeal.findUniqueOrThrow({ where: { id: meal.id } });
    expect(after.status).toBe('COMPLETED');
    expect(after.actualTime).toBe('12:15');
  });

  it('rejects a malformed time', async () => {
    const meal = await firstMeal();
    const result = await dayActions.setMealActualTime({
      dailyMealId: meal.id,
      actualTime: '25:99',
    });
    expect(result.ok).toBe(false);
  });

  it('clears the recorded time when a completion is undone', async () => {
    const meal = await firstMeal();
    await dayActions.completeMeal({ dailyMealId: meal.id });
    await dayActions.undoMealCompletion({ dailyMealId: meal.id });

    const after = await testPrisma().dailyMeal.findUniqueOrThrow({ where: { id: meal.id } });
    expect(after.status).toBe('PENDING');
    expect(after.actualTime).toBeNull();
    expect(after.scheduledTime).toBe('13:00');
  });

  it('records no actual time for a skipped meal', async () => {
    const meal = await firstMeal();
    await dayActions.skipMeal({ dailyMealId: meal.id, note: 'Travelling' });

    const after = await testPrisma().dailyMeal.findUniqueOrThrow({ where: { id: meal.id } });
    expect(after.status).toBe('SKIPPED');
    expect(after.actualTime).toBeNull();
  });

  it('supports all three states on one day', async () => {
    const view = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    await dayActions.completeMeal({ dailyMealId: view.meals[0]!.id });
    await dayActions.skipMeal({ dailyMealId: view.meals[1]!.id });

    const meals = await testPrisma().dailyMeal.findMany({
      where: { dailyPlanId: view.id },
      orderBy: { sortOrder: 'asc' },
    });

    expect(meals.map((m) => m.status)).toEqual(['COMPLETED', 'SKIPPED']);
    expect(meals[0]!.actualTime).not.toBeNull();
    expect(meals[1]!.actualTime).toBeNull();
  });

  it('keeps the recorded time when the day is rebuilt from the plan', async () => {
    const meal = await firstMeal();
    await dayActions.setMealActualTime({
      dailyMealId: meal.id,
      actualTime: '13:47',
      markCompleted: true,
    });

    // Rebuilding replaces the meal rows, so the eaten time has to be carried
    // across — it is the one value that exists nowhere else.
    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', { regenerate: true });

    const after = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(after.meals[0]!.status).toBe('COMPLETED');
    expect(after.meals[0]!.actualTime).toBe('13:47');
  });

  it('keeps the recorded time when the day type is switched', async () => {
    const meal = await firstMeal();
    await dayActions.setMealActualTime({
      dailyMealId: meal.id,
      actualTime: '08:15',
      markCompleted: true,
    });

    await dayActions.setDayType({ date: '2026-09-14', dayTypeId: fixture.restId });

    const after = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    expect(after.isTraining).toBe(false);
    expect(after.meals[0]!.actualTime).toBe('08:15');
  });

  it('keeps both times in the stored history', async () => {
    const meal = await firstMeal();
    await dayActions.setMealActualTime({
      dailyMealId: meal.id,
      actualTime: '13:47',
      markCompleted: true,
    });

    const rows = await analytics.getDayRows(fixture.userId, '2026-09-14', '2026-09-14');
    const times = rows[0]!.mealTimes[0]!;

    expect(times.scheduledTime).toBe('13:00');
    expect(times.actualTime).toBe('13:47');
    expect(times.status).toBe('COMPLETED');
  });
});

/* -------------------------------------------------------------------------- */
/* 5. Weekly history                                                           */
/* -------------------------------------------------------------------------- */

describe('weekly history', () => {
  it('reports training status, workout and meal times per day', async () => {
    await workout.setDayWorkout({
      date: '2026-09-14',
      focusIds: [focus.Chest, focus.Triceps],
    });
    const monday = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    await dayActions.completeMeal({ dailyMealId: monday.meals[0]!.id });

    await workout.setDayWorkout({ date: '2026-09-15', focusIds: [focus.Back, focus.Biceps] });

    // Saturday is a rest day.
    await dayQueries.getDayView(fixture.userId, '2026-09-19');

    const rows = await analytics.getDayRows(fixture.userId, '2026-09-14', '2026-09-20');

    const mondayRow = rows.find((r) => r.date === '2026-09-14')!;
    expect(mondayRow.isTraining).toBe(true);
    expect(mondayRow.workout.focusNames).toEqual(['Chest', 'Triceps']);
    expect(mondayRow.mealTimes[0]!.actualTime).not.toBeNull();

    const tuesdayRow = rows.find((r) => r.date === '2026-09-15')!;
    expect(tuesdayRow.workout.focusNames).toEqual(['Back', 'Biceps']);

    const saturdayRow = rows.find((r) => r.date === '2026-09-19')!;
    expect(saturdayRow.isTraining).toBe(false);
    expect(saturdayRow.workout.focusNames).toEqual([]);
  });

  it('counts how often each body part was trained', async () => {
    // Relative to today, because analytics deliberately ignore future days —
    // a session you have not done yet is not one you trained.
    const { addDays, todayKey } = await import('@/lib/domain/dates');
    const today = todayKey();
    const days = [addDays(today, -3), addDays(today, -2), addDays(today, -1)];

    // Force these to training days so the fixture's weekday pattern does not
    // decide whether the test has anything to count.
    for (const date of days) {
      await dayService.ensureDailyPlan(fixture.userId, date, { dayTypeId: fixture.trainingId });
    }

    await workout.setDayWorkout({ date: days[0]!, focusIds: [focus.Chest, focus.Triceps] });
    await workout.setDayWorkout({ date: days[1]!, focusIds: [focus.Chest] });
    await workout.setDayWorkout({ date: days[2]!, focusIds: [focus.Back] });

    const counts = await analytics.getWorkoutFrequency(fixture.userId, days[0]!, today);
    expect(counts[0]).toEqual({ name: 'Chest', sessions: 2 });
    expect(counts.find((c) => c.name === 'Back')?.sessions).toBe(1);
  });

  it('ignores workouts recorded against a future date', async () => {
    const { addDays, todayKey } = await import('@/lib/domain/dates');
    const tomorrow = addDays(todayKey(), 1);

    await dayService.ensureDailyPlan(fixture.userId, tomorrow, { dayTypeId: fixture.trainingId });
    await workout.setDayWorkout({ date: tomorrow, focusIds: [focus.Legs] });

    const counts = await analytics.getWorkoutFrequency(
      fixture.userId,
      addDays(todayKey(), -7),
      addDays(todayKey(), 7),
    );
    expect(counts.find((c) => c.name === 'Legs')).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* 6. Cascading meal times                                                     */
/* -------------------------------------------------------------------------- */

/*
 * The timing rules end to end: meals every three hours from the first one, the
 * pre-workout meal an hour before training, and an hour and a half before it
 * when the session includes legs.
 */
describe('cascading meal times', () => {
  /** The user's rules, plus Meal B as the meal eaten before training. */
  async function applyCascadeRules() {
    const prisma = testPrisma();
    await prisma.settings.update({
      where: { userId: fixture.userId },
      data: {
        autoScheduleMeals: true,
        firstMealTime: '08:00',
        mealIntervalMinutes: 180,
        mealIntervalMaxMinutes: 240,
        preWorkoutMinutes: 60,
        workoutTime: '19:30',
        workoutDurationMinutes: 60,
        // The fixture plan has two meals, so Meal B is both the pre-workout
        // meal and the last one. A window starting at 11:00 lets it sit where
        // the interval puts it on a rest day instead of being dragged into the
        // evening, which would only be testing the window.
        lastMealEarliest: '11:00',
        lastMealLatest: '23:00',
      },
    });
    await prisma.meal.update({
      where: { id: fixture.mealIds.mealB! },
      data: { isPreWorkout: true },
    });
    await prisma.workoutFocus.update({
      where: { id: focus.Legs },
      data: { preWorkoutMinutes: 90 },
    });
  }

  const times = async (date: string) =>
    (await dayQueries.getDayView(fixture.userId, date)).meals.map((m) => m.scheduledTime);

  it('spaces meals by the interval on a rest day', async () => {
    await applyCascadeRules();
    // Saturday: a rest day in the fixture's weekly pattern.
    expect(await times('2026-09-19')).toEqual(['08:00', '11:00']);
  });

  it('pins the pre-workout meal an hour before training', async () => {
    await applyCascadeRules();
    // Monday: a training day. 19:30 minus 60 minutes.
    expect(await times('2026-09-14')).toEqual(['08:00', '18:30']);
  });

  it('cascades from the first meal when it moves', async () => {
    await applyCascadeRules();
    await testPrisma().settings.update({
      where: { userId: fixture.userId },
      data: { firstMealTime: '09:30' },
    });
    expect(await times('2026-09-19')).toEqual(['09:30', '12:30']);
  });

  it('moves the pre-workout meal earlier when legs are recorded', async () => {
    await applyCascadeRules();
    expect(await times('2026-09-14')).toEqual(['08:00', '18:30']);

    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Legs] });

    // 19:30 minus 90 minutes, because the leg focus asks for a longer gap.
    expect(await times('2026-09-14')).toEqual(['08:00', '18:00']);
  });

  it('takes the longest gap when a session mixes legs with something else', async () => {
    await applyCascadeRules();
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Chest, focus.Legs] });
    expect(await times('2026-09-14')).toEqual(['08:00', '18:00']);
  });

  it('puts the meal back to the default gap when legs are cleared', async () => {
    await applyCascadeRules();
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Legs] });
    expect(await times('2026-09-14')).toEqual(['08:00', '18:00']);

    await workout.clearDayWorkout({ date: '2026-09-14' });
    expect(await times('2026-09-14')).toEqual(['08:00', '18:30']);
  });

  it('says so when the times changed', async () => {
    await applyCascadeRules();
    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');

    const result = await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Legs] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.message).toMatch(/meal times updated/);
  });

  it('leaves a meal you have already eaten at the time it was planned for', async () => {
    await applyCascadeRules();

    const before = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    const preWorkoutMeal = before.meals[1]!;
    expect(preWorkoutMeal.scheduledTime).toBe('18:30');

    await dayActions.completeMeal({ dailyMealId: preWorkoutMeal.id });
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Legs] });

    // Re-timing a day is about what is still ahead of you. What you already ate
    // keeps the time it was planned for, because that is what happened.
    const after = await testPrisma().dailyMeal.findUniqueOrThrow({
      where: { id: preWorkoutMeal.id },
    });
    expect(after.scheduledTime).toBe('18:30');
  });

  it('ignores the workout anchors on a rest day even with a workout recorded', async () => {
    await applyCascadeRules();
    // Saturday is a rest day; recording a session on it should not drag the
    // meal to a pre-workout slot.
    await workout.setDayWorkout({ date: '2026-09-19', focusIds: [focus.Legs] });
    expect(await times('2026-09-19')).toEqual(['08:00', '11:00']);
  });

  it("falls back to each meal's own time when the cascade is switched off", async () => {
    await applyCascadeRules();
    await testPrisma().settings.update({
      where: { userId: fixture.userId },
      data: { autoScheduleMeals: false },
    });

    // The fixture's stored defaults, not the generated cascade.
    expect(await times('2026-09-14')).toEqual(['13:00', '19:00']);
  });

  it('does not re-time a day when the cascade is switched off', async () => {
    await applyCascadeRules();
    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14');
    await testPrisma().settings.update({
      where: { userId: fixture.userId },
      data: { autoScheduleMeals: false },
    });

    const changed = await dayService.retimeDay(fixture.userId, '2026-09-14');
    expect(changed).toBe(0);
  });

  it('lets a per-day-type override beat the cascade', async () => {
    await applyCascadeRules();
    await testPrisma().mealDayTypeSetting.updateMany({
      where: { mealId: fixture.mealIds.mealA!, dayTypeId: fixture.trainingId },
      data: { timeOverride: '07:15' },
    });
    expect(await times('2026-09-14')).toEqual(['07:15', '18:30']);
  });

  it("starts a new day from this weekday's usual workout when timing it", async () => {
    await applyCascadeRules();

    const monday = await testPrisma().scheduleDay.findFirstOrThrow({
      where: { userId: fixture.userId, dayOfWeek: 1 },
    });
    await testPrisma().scheduleDayFocus.create({
      data: { scheduleDayId: monday.id, focusId: focus.Legs, sortOrder: 0 },
    });

    // 2026-09-21 is a Monday that has never been opened, so it is built fresh
    // and should already know it is a leg day.
    expect(await times('2026-09-21')).toEqual(['08:00', '18:00']);
  });
});

/* -------------------------------------------------------------------------- */
/* 7. A workout time that varies                                               */
/* -------------------------------------------------------------------------- */

/*
 * Gym time is decided on the day, not in Settings, and the pre-workout meal
 * follows it. These check the whole path: set a time, the day re-times, and
 * neither the usual time nor anything already eaten is disturbed.
 */
describe('setting the workout time for one day', () => {
  async function applyCascadeRules() {
    await testPrisma().settings.update({
      where: { userId: fixture.userId },
      data: {
        autoScheduleMeals: true,
        firstMealTime: '08:00',
        mealIntervalMinutes: 180,
        mealIntervalMaxMinutes: 240,
        preWorkoutMinutes: 60,
        workoutTime: '19:30',
        workoutDurationMinutes: 60,
        lastMealEarliest: '11:00',
        lastMealLatest: '23:00',
      },
    });
    await testPrisma().meal.update({
      where: { id: fixture.mealIds.mealB! },
      data: { isPreWorkout: true },
    });
  }

  const times = async (date: string) =>
    (await dayQueries.getDayView(fixture.userId, date)).meals.map((m) => m.scheduledTime);

  it('moves the pre-workout meal to match', async () => {
    await applyCascadeRules();
    expect(await times('2026-09-14')).toEqual(['08:00', '18:30']);

    const result = await workout.setDayWorkoutTime({ date: '2026-09-14', workoutTime: '15:00' });
    expect(result.ok).toBe(true);

    // An hour before the session actually chosen, not before the usual one.
    expect(await times('2026-09-14')).toEqual(['08:00', '14:00']);
  });

  it('leaves the usual time in Settings alone', async () => {
    await applyCascadeRules();
    await workout.setDayWorkoutTime({ date: '2026-09-14', workoutTime: '15:00' });

    const settings = await testPrisma().settings.findUniqueOrThrow({
      where: { userId: fixture.userId },
    });
    expect(settings.workoutTime).toBe('19:30');
  });

  it('changes that one date only', async () => {
    await applyCascadeRules();
    await workout.setDayWorkoutTime({ date: '2026-09-14', workoutTime: '15:00' });

    // Tuesday is a training day too, and still on the usual time.
    expect(await times('2026-09-15')).toEqual(['08:00', '18:30']);
  });

  it('puts the day back on the usual time when cleared', async () => {
    await applyCascadeRules();
    await workout.setDayWorkoutTime({ date: '2026-09-14', workoutTime: '15:00' });
    expect(await times('2026-09-14')).toEqual(['08:00', '14:00']);

    await workout.setDayWorkoutTime({ date: '2026-09-14', workoutTime: '' });
    expect(await times('2026-09-14')).toEqual(['08:00', '18:30']);
  });

  it('survives a rebuild of the day', async () => {
    await applyCascadeRules();
    await workout.setDayWorkoutTime({ date: '2026-09-14', workoutTime: '15:00' });

    await dayService.ensureDailyPlan(fixture.userId, '2026-09-14', { regenerate: true });

    // Rebuilding from the plan must not quietly reinstate the usual time.
    const day = await testPrisma().dailyPlan.findFirstOrThrow({
      where: { userId: fixture.userId, date: new Date('2026-09-14T00:00:00.000Z') },
    });
    expect(day.workoutTime).toBe('15:00');
    expect(await times('2026-09-14')).toEqual(['08:00', '14:00']);
  });

  it('stacks with a leg day, taking the longer gap', async () => {
    await applyCascadeRules();
    await testPrisma().workoutFocus.update({
      where: { id: focus.Legs },
      data: { preWorkoutMinutes: 90 },
    });

    await workout.setDayWorkoutTime({ date: '2026-09-14', workoutTime: '15:00' });
    await workout.setDayWorkout({ date: '2026-09-14', focusIds: [focus.Legs] });

    // 15:00 minus 90, not 19:30 minus 90.
    expect(await times('2026-09-14')).toEqual(['08:00', '13:30']);
  });

  it('leaves a meal already eaten at the time it was planned for', async () => {
    await applyCascadeRules();

    const before = await dayQueries.getDayView(fixture.userId, '2026-09-14');
    const preWorkoutMeal = before.meals[1]!;
    await dayActions.completeMeal({ dailyMealId: preWorkoutMeal.id });

    await workout.setDayWorkoutTime({ date: '2026-09-14', workoutTime: '15:00' });

    const after = await testPrisma().dailyMeal.findUniqueOrThrow({
      where: { id: preWorkoutMeal.id },
    });
    expect(after.scheduledTime).toBe('18:30');
  });

  it('refuses on a rest day, where there is no session to eat around', async () => {
    await applyCascadeRules();
    // Saturday.
    const result = await workout.setDayWorkoutTime({ date: '2026-09-19', workoutTime: '15:00' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/rest day/);
  });

  it('rejects a malformed time', async () => {
    await applyCascadeRules();
    const result = await workout.setDayWorkoutTime({ date: '2026-09-14', workoutTime: '25:99' });
    expect(result.ok).toBe(false);
  });
});
