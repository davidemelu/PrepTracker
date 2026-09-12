import { describe, expect, it } from 'vitest';
import {
  findNextMeal,
  findOverdueMeals,
  generateMealTimes,
  shiftScheduleFrom,
  type SchedulableMeal,
  type TimingPreferences,
} from '@/lib/domain/schedule';
import {
  addMinutes,
  formatDuration,
  formatTime12h,
  formatTimeRange,
  minutesToTime,
  minutesUntil,
  relativeMinutes,
  timeToMinutes,
} from '@/lib/domain/time';
import { buildReminders } from '@/lib/domain/reminders';

/** The seeded preferences. */
const prefs: TimingPreferences = {
  firstMealTime: '13:00',
  mealIntervalMinutes: 150,
  mealDurationMinutes: 20,
  workoutTime: '19:30',
  workoutDurationMinutes: 60,
  bedtime: '01:00',
  preWorkoutMinutes: 120,
  postWorkoutMinutes: 30,
};

const meals: SchedulableMeal[] = [
  { id: 'm1', name: 'Meal 1', sortOrder: 0, isPreWorkout: false, isPostWorkout: false },
  { id: 'm2', name: 'Meal 2', sortOrder: 1, isPreWorkout: false, isPostWorkout: false },
  { id: 'm3', name: 'Meal 3', sortOrder: 2, isPreWorkout: true, isPostWorkout: false, windowMinutes: 30 },
  { id: 'm4', name: 'Meal 4', sortOrder: 3, isPreWorkout: false, isPostWorkout: true },
  { id: 'm5', name: 'Meal 5', sortOrder: 4, isPreWorkout: false, isPostWorkout: false },
];

describe('time helpers', () => {
  it('round-trips HH:mm and minutes', () => {
    expect(timeToMinutes('13:30')).toBe(810);
    expect(minutesToTime(810)).toBe('13:30');
  });

  it('rejects malformed times', () => {
    expect(() => timeToMinutes('25:00')).toThrow();
    expect(() => timeToMinutes('1:00')).toThrow();
  });

  it('wraps past midnight', () => {
    expect(addMinutes('23:30', 120)).toBe('01:30');
    expect(minutesToTime(-30)).toBe('23:30');
  });

  it('measures forward across midnight', () => {
    expect(minutesUntil('23:00', '01:00')).toBe(120);
    expect(minutesUntil('13:00', '15:30')).toBe(150);
  });

  it('treats the recent past as negative, not as tomorrow', () => {
    expect(relativeMinutes('15:00', '14:30')).toBe(-30);
    expect(relativeMinutes('23:00', '01:00')).toBe(120);
  });

  it('formats 12-hour times and ranges', () => {
    expect(formatTime12h('13:00')).toBe('1:00 PM');
    expect(formatTime12h('00:30')).toBe('12:30 AM');
    expect(formatTimeRange('17:30', 30)).toBe('5:30 – 6:00 PM');
    expect(formatTimeRange('17:30')).toBe('5:30 PM');
  });

  it('formats durations', () => {
    expect(formatDuration(95)).toBe('1h 35m');
    expect(formatDuration(40)).toBe('40m');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(-20)).toBe('20m ago');
  });
});

describe('generateMealTimes', () => {
  const generated = generateMealTimes(meals, prefs);
  const at = (id: string) => generated.meals.find((m) => m.mealId === id)!.time;

  it('starts at the preferred first meal time', () => {
    expect(at('m1')).toBe('13:00');
  });

  it('spreads the meals between two anchors rather than packing them early', () => {
    // 13:00 to the 17:30 pre-workout anchor is 4.5 hours over two gaps, so Meal
    // 2 sits halfway at 15:15 instead of one interval in at 15:30 followed by a
    // shorter hop. Even spacing beats a tidy first gap and an awkward second.
    expect(at('m2')).toBe('15:15');
  });

  it('anchors the pre-workout meal ahead of training', () => {
    // 19:30 workout minus 120 minutes.
    expect(at('m3')).toBe('17:30');
  });

  it('anchors the meal after training to the end of the session', () => {
    // 19:30 + 60 minutes of training + 30 minutes.
    expect(at('m4')).toBe('21:00');
  });

  it('continues on the interval after the post-workout anchor', () => {
    expect(at('m5')).toBe('23:30');
  });

  it('reproduces the schedule the plan was written with', () => {
    expect(generated.meals.map((m) => m.time)).toEqual(['13:00', '15:15', '17:30', '21:00', '23:30']);
    expect(generated.warnings).toHaveLength(0);
  });

  it('reports the workout window', () => {
    expect(generated.workoutStart).toBe('19:30');
    expect(generated.workoutEnd).toBe('20:30');
  });

  it('carries the eating window through to the label', () => {
    expect(generated.meals.find((m) => m.mealId === 'm3')!.label).toBe('5:30 – 6:00 PM');
  });

  it('moves the whole day when the first meal moves', () => {
    const later = generateMealTimes(meals, { ...prefs, firstMealTime: '15:00' });
    // The pre-workout anchor stays at 17:30, so the two and a half hours before
    // it are simply shared out. Nothing collides and nothing is pushed.
    expect(later.meals.map((m) => m.time)).toEqual(['15:00', '16:15', '17:30', '21:00', '23:30']);
    expect(later.warnings.join(' ')).toMatch(/tighter than your minimum/);
  });

  it('drops an anchor the day has no room to reach', () => {
    // Starting at 17:00 leaves no space for two meals before a 17:30
    // pre-workout slot, so Meal 3 joins the spread instead of being crushed
    // against the meals ahead of it.
    const late = generateMealTimes(meals, { ...prefs, firstMealTime: '17:00' });
    expect(late.meals[2]!.reason).toBe('interval');
    expect(late.warnings.join(' ')).toMatch(/leaves no room to place Meal 3 before it/);
  });

  it('honours a manually pinned time', () => {
    const pinned = generateMealTimes(
      meals.map((m) => (m.id === 'm2' ? { ...m, manualTime: '16:00' } : m)),
      prefs,
    );
    expect(pinned.meals[1]!.time).toBe('16:00');
    expect(pinned.meals[1]!.reason).toBe('manual');
  });

  it('never lets a meal land before the one ahead of it', () => {
    const result = generateMealTimes(meals, { ...prefs, firstMealTime: '17:00' });
    const minutes = result.meals.map((m) => minutesUntil('17:00', m.time));
    for (let i = 1; i < minutes.length; i += 1) {
      expect(minutes[i]!).toBeGreaterThan(minutes[i - 1]!);
    }
  });

  it('compresses the tail so the last meal finishes before bedtime', () => {
    const tight = generateMealTimes(meals, { ...prefs, bedtime: '22:30' });
    expect(tight.warnings.join(' ')).toMatch(/closer together|lands after/);
  });

  it('warns when the plan simply cannot fit', () => {
    const impossible = generateMealTimes(meals, { ...prefs, bedtime: '13:30' });
    expect(impossible.warnings.join(' ')).toMatch(/lands after/);
  });

  it('handles an empty plan', () => {
    expect(generateMealTimes([], prefs).meals).toHaveLength(0);
  });

  it('works with no pre- or post-workout meal', () => {
    const plain = generateMealTimes(
      meals.map((m) => ({ ...m, isPreWorkout: false, isPostWorkout: false })),
      prefs,
    );
    expect(plain.meals.map((m) => m.time)).toEqual(['13:00', '15:30', '18:00', '20:30', '23:00']);
  });
});

/*
 * The cascading rules: meals every three hours from the first one, the
 * pre-workout meal an hour before training, and an hour and a half before it on
 * a leg day. Rest days have nothing to eat around, so they are a plain cascade.
 */
describe('cascading meal times', () => {
  const cascade: TimingPreferences = {
    firstMealTime: '08:00',
    mealIntervalMinutes: 180,
    mealIntervalMaxMinutes: 240,
    mealDurationMinutes: 20,
    workoutTime: '19:30',
    workoutDurationMinutes: 60,
    bedtime: '01:00',
    preWorkoutMinutes: 60,
    postWorkoutMinutes: 30,
    lastMealEarliest: '21:00',
    lastMealLatest: '23:00',
  };

  it('spreads a rest day evenly into the last-meal window', () => {
    // Five meals from 08:00 with the last one aimed at 21:00 comes out at 3h15
    // each — inside the 3-4 hour band, so nothing is reported.
    const rest = generateMealTimes(meals, { ...cascade, hasWorkout: false });
    expect(rest.meals.map((m) => m.time)).toEqual(['08:00', '11:15', '14:30', '17:45', '21:00']);
    expect(rest.warnings).toHaveLength(0);
  });

  it('cascades from wherever the first meal is set', () => {
    const later = generateMealTimes(meals, {
      ...cascade,
      hasWorkout: false,
      firstMealTime: '09:30',
    });
    expect(later.meals.map((m) => m.time)).toEqual(['09:30', '12:30', '15:30', '18:30', '21:30']);
    expect(later.warnings).toHaveLength(0);
  });

  it('puts the pre-workout meal an hour before training', () => {
    const training = generateMealTimes(meals, { ...cascade, hasWorkout: true });
    // 19:30 minus 60.
    expect(training.meals[2]!.time).toBe('18:30');
    expect(training.meals[2]!.reason).toBe('pre-workout');
  });

  it('moves it to ninety minutes before on a leg day', () => {
    // What effectivePreWorkoutMinutes hands back when a leg focus is on the day.
    const legs = generateMealTimes(meals, { ...cascade, hasWorkout: true, preWorkoutMinutes: 90 });
    expect(legs.meals[2]!.time).toBe('18:00');
  });

  it('resumes after the workout and finishes in the window', () => {
    const training = generateMealTimes(meals, { ...cascade, hasWorkout: true });
    // Meal 4 is 19:30 + 60 training + 30. Meal 5 would fall at midnight on the
    // interval, so the window pulls it back to 23:00.
    expect(training.meals.map((m) => m.time)).toEqual([
      '08:00',
      '13:15',
      '18:30',
      '21:00',
      '23:00',
    ]);
  });

  it('says out loud when no spacing can cover the run-up to a late workout', () => {
    // Three meals cannot span 08:00 to a pinned 18:30 inside four hours each.
    // Spreading gets it as even as it can and then reports what is left.
    const training = generateMealTimes(meals, { ...cascade, hasWorkout: true });
    const warning = training.warnings.join(' ');
    expect(warning).toMatch(/Meal 1 through Meal 3 sit 5\.3 hours apart/);
    expect(warning).toMatch(/longer than your maximum of 4 hours/);
    // And it names which end is pinned, so there is something to act on.
    expect(warning).toMatch(/training earlier, or starting the day later/);
  });

  it('does not nag about the gap the workout itself creates', () => {
    // Pre-workout 60 + session 60 + post-workout 30 is always 2.5 hours, which
    // is under the 3-hour minimum by construction. Reporting it every day would
    // be noise, so that one pair is exempt.
    const training = generateMealTimes(meals, { ...cascade, hasWorkout: true });
    expect(training.warnings.join(' ')).not.toMatch(/Meal 3 and Meal 4/);
  });

  it('has no such gap on a rest day', () => {
    const rest = generateMealTimes(meals, { ...cascade, hasWorkout: false });
    expect(rest.warnings).toHaveLength(0);
  });

  it('ignores both workout anchors on a rest day', () => {
    const rest = generateMealTimes(meals, { ...cascade, hasWorkout: false });
    expect(rest.meals.map((m) => m.reason)).toEqual([
      'first-meal',
      'interval',
      'interval',
      'interval',
      // Still anchored, but by the evening window rather than by training.
      'last-meal',
    ]);
  });

  it('cascades from a pinned first meal, even one before the usual start', () => {
    // A per-day-type override on Meal 1 moves the whole day, rather than being
    // read as 07:15 tomorrow and dragging everything else around the clock.
    const pinned = generateMealTimes(
      meals.map((m) => (m.id === 'm1' ? { ...m, manualTime: '07:15' } : m)),
      { ...cascade, hasWorkout: true },
    );
    expect(pinned.meals[0]!.time).toBe('07:15');
    expect(pinned.meals[2]!.time).toBe('18:30');
    // Meal 2 shares out the run-up rather than sitting one interval in.
    expect(pinned.meals[1]!.time).toBe('12:53');
  });

  it('reads a pin on a later meal as the next morning', () => {
    // 06:00 on a day that starts at 08:00 is tomorrow, not sixteen hours ago,
    // so the meals before it keep their order.
    const pinned = generateMealTimes(
      meals.map((m) => (m.id === 'm5' ? { ...m, manualTime: '06:00' } : m)),
      // A late bedtime, so the guard does not pull the pin back before it can
      // demonstrate the wrap.
      { ...cascade, hasWorkout: true, bedtime: '07:00' },
    );
    expect(pinned.meals[4]!.time).toBe('06:00');
    expect(minutesUntil('08:00', pinned.meals[4]!.time)).toBeGreaterThan(
      minutesUntil('08:00', pinned.meals[3]!.time),
    );
  });

  it('still honours a pinned time inside the cascade', () => {
    const pinned = generateMealTimes(
      meals.map((m) => (m.id === 'm2' ? { ...m, manualTime: '12:00' } : m)),
      { ...cascade, hasWorkout: false },
    );
    // Meal 2 sits where it was pinned and the rest spread from it to the window.
    expect(pinned.meals.map((m) => m.time)).toEqual(['08:00', '12:00', '15:00', '18:00', '21:00']);
  });
});

describe('shiftScheduleFrom', () => {
  const generated = generateMealTimes(meals, prefs).meals;

  it('moves the named meal and everything after it by the same amount', () => {
    const shifted = shiftScheduleFrom(generated, 'm1', '14:00');
    expect(shifted.map((m) => m.time)).toEqual(['14:00', '16:15', '18:30', '22:00', '00:30']);
  });

  it('leaves earlier meals untouched', () => {
    const shifted = shiftScheduleFrom(generated, 'm4', '21:30');
    expect(shifted[0]!.time).toBe('13:00');
    expect(shifted[3]!.time).toBe('21:30');
    expect(shifted[4]!.time).toBe('00:00');
  });

  it('is a no-op for an unknown meal or an unchanged time', () => {
    expect(shiftScheduleFrom(generated, 'nope', '10:00')).toEqual(generated);
    expect(shiftScheduleFrom(generated, 'm1', '13:00')).toEqual(generated);
  });
});

describe('findNextMeal', () => {
  const day = [
    { id: 'a', sortOrder: 0, scheduledTime: '13:00', status: 'COMPLETED' },
    { id: 'b', sortOrder: 1, scheduledTime: '15:30', status: 'PENDING' },
    { id: 'c', sortOrder: 2, scheduledTime: '17:30', status: 'PENDING' },
    { id: 'd', sortOrder: 3, scheduledTime: '21:00', status: 'SKIPPED' },
  ];

  it('picks the soonest pending meal', () => {
    const next = findNextMeal(day, '14:00');
    expect(next?.meal.id).toBe('b');
    expect(next?.minutesAway).toBe(90);
  });

  it('ignores completed and skipped meals', () => {
    expect(findNextMeal(day, '18:00')?.meal.id).toBe('b');
  });

  it('returns null when nothing is pending', () => {
    expect(findNextMeal(day.map((m) => ({ ...m, status: 'COMPLETED' })), '14:00')).toBeNull();
  });
});

describe('findOverdueMeals', () => {
  const day = [
    { scheduledTime: '13:00', status: 'PENDING', id: 'a' },
    { scheduledTime: '15:30', status: 'PENDING', id: 'b' },
    { scheduledTime: '21:00', status: 'COMPLETED', id: 'c' },
  ];

  it('finds pending meals whose time has passed', () => {
    expect(findOverdueMeals(day, '16:00').map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('respects the grace period', () => {
    expect(findOverdueMeals(day, '15:40', 15)).toHaveLength(1);
  });

  it('ignores completed meals', () => {
    expect(findOverdueMeals(day, '23:00').map((m) => m.id)).toEqual(['a', 'b']);
  });
});

/*
 * Gym time varies, and the day has to follow it. These cases walk the workout
 * across the day and check that the schedule stays sane at each stop rather
 * than only at the one time the plan was written around.
 */
describe('a workout that moves', () => {
  const rules: TimingPreferences = {
    firstMealTime: '08:00',
    mealIntervalMinutes: 180,
    mealIntervalMaxMinutes: 240,
    mealDurationMinutes: 20,
    workoutTime: '17:00',
    workoutDurationMinutes: 60,
    bedtime: '01:00',
    preWorkoutMinutes: 60,
    postWorkoutMinutes: 30,
    lastMealEarliest: '21:00',
    lastMealLatest: '23:00',
    hasWorkout: true,
  };

  const at = (workoutTime: string) => generateMealTimes(meals, { ...rules, workoutTime });

  it('keeps the pre-workout meal exactly an hour ahead wherever training lands', () => {
    for (const [workoutTime, expected] of [
      ['15:00', '14:00'],
      ['17:00', '16:00'],
      ['19:30', '18:30'],
      ['21:00', '20:00'],
    ] as const) {
      expect(at(workoutTime).meals[2]!.time).toBe(expected);
    }
  });

  it('re-spaces the whole run-up, not just the pre-workout meal', () => {
    // The same five meals, three hours earlier in the gym: every gap before the
    // session changes, because the meals in between are shared out afresh.
    expect(at('15:00').meals.map((m) => m.time)).toEqual([
      '08:00',
      '11:00',
      '14:00',
      '16:30',
      '21:00',
    ]);
    expect(at('21:00').meals.map((m) => m.time)).toEqual([
      '08:00',
      '14:00',
      '20:00',
      '22:30',
      '23:00',
    ]);
  });

  it('finds a day with no complaints when the workout suits the plan', () => {
    // 17:00 is the time five meals from 08:00 actually fit around.
    const clean = at('17:00');
    expect(clean.meals.map((m) => m.time)).toEqual([
      '08:00',
      '12:00',
      '16:00',
      '18:30',
      '21:30',
    ]);
    expect(clean.warnings).toHaveLength(0);
  });

  it('gives up on the anchors when training starts before eating does', () => {
    // A 06:00 session with a 08:00 first meal. Measured forwards, the
    // pre-workout slot is almost a day away; treating it as real would drag the
    // whole day around the clock, so both anchors are dropped instead.
    const early = at('06:00');
    expect(early.meals.map((m) => m.time)).toEqual([
      '08:00',
      '11:15',
      '14:30',
      '17:45',
      '21:00',
    ]);
    expect(early.warnings.join(' ')).toMatch(/06:00 workout leaves no room to place Meal 3/);
  });

  it('never lets the day run backwards, wherever the workout is', () => {
    for (const workoutTime of ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '23:00']) {
      const times = at(workoutTime).meals.map((m) => minutesUntil('08:00', m.time));
      for (let i = 1; i < times.length; i += 1) {
        expect(times[i]!).toBeGreaterThan(times[i - 1]!);
      }
    }
  });

  it('holds the last meal in its window across the range', () => {
    for (const workoutTime of ['12:00', '15:00', '17:00', '19:30']) {
      const last = at(workoutTime).meals[4]!.time;
      expect(minutesUntil('08:00', last)).toBeGreaterThanOrEqual(minutesUntil('08:00', '21:00'));
      expect(minutesUntil('08:00', last)).toBeLessThanOrEqual(minutesUntil('08:00', '23:00'));
    }
  });

  it('ignores the workout time entirely on a rest day', () => {
    const a = generateMealTimes(meals, { ...rules, hasWorkout: false, workoutTime: '09:00' });
    const b = generateMealTimes(meals, { ...rules, hasWorkout: false, workoutTime: '21:00' });
    expect(a.meals.map((m) => m.time)).toEqual(b.meals.map((m) => m.time));
  });
});

describe('the overdue rule is one rule', () => {
  it('agrees between the meal list and the reminders seven hours late', () => {
    // The reminders used to look back only six hours, so a meal this late was
    // styled overdue on Today and missing from the list meant to summarise it.
    const meals = [{ id: 'm1', name: 'Meal 1', scheduledTime: '08:00', status: 'PENDING' }];
    const overdue = findOverdueMeals(meals, '15:30');
    expect(overdue).toHaveLength(1);

    const reminders = buildReminders({
      today: '2026-09-14',
      nowTime: '15:30',
      meals: meals.map((m) => ({ ...m, status: 'PENDING' as const })),
      supplements: [],
      water: { totalMl: 0, targetMl: 4000 },
      storage: [],
    });
    expect(reminders.some((r) => r.kind === 'MEAL_OVERDUE')).toBe(true);
  });

  it('treats a meal inside the grace period as not yet late on either surface', () => {
    const meals = [{ id: 'm1', name: 'Meal 1', scheduledTime: '08:00', status: 'PENDING' }];
    expect(findOverdueMeals(meals, '08:10')).toHaveLength(0);
  });
});
