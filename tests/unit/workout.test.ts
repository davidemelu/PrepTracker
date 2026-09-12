import { describe, expect, it } from 'vitest';
import {
  focusFrequency,
  formatWorkout,
  formatWorkoutShort,
  groupFocuses,
  hasWorkout,
  resolveFocuses,
  effectivePreWorkoutMinutes,
  untrackedTrainingDays,
  validateFocusSelection,
  validateWorkoutName,
  MAX_FOCUSES_PER_DAY,
  type WorkoutFocusLike,
} from '@/lib/domain/workout';
import { formatTimingDelta, timingDelta } from '@/lib/domain/time';

const catalogue: WorkoutFocusLike[] = [
  { id: 'chest', name: 'Chest', category: 'MUSCLE_GROUP', sortOrder: 0, active: true },
  { id: 'back', name: 'Back', category: 'MUSCLE_GROUP', sortOrder: 1, active: true },
  { id: 'triceps', name: 'Triceps', category: 'MUSCLE_GROUP', sortOrder: 4, active: true },
  { id: 'biceps', name: 'Biceps', category: 'MUSCLE_GROUP', sortOrder: 3, active: true },
  { id: 'push', name: 'Push', category: 'SPLIT', sortOrder: 0, active: true },
  { id: 'cardio', name: 'Cardio', category: 'CONDITIONING', sortOrder: 0, active: true },
  { id: 'retired', name: 'Old split', category: 'SPLIT', sortOrder: 9, active: false },
];

describe('formatWorkout', () => {
  it('joins multiple focuses the way you would say them', () => {
    expect(formatWorkout({ workoutName: null, focusNames: ['Chest', 'Triceps'] })).toBe(
      'Chest + Triceps',
    );
    expect(formatWorkout({ workoutName: null, focusNames: ['Back', 'Biceps'] })).toBe('Back + Biceps');
  });

  it('uses a custom name on its own', () => {
    expect(formatWorkout({ workoutName: 'Upper A', focusNames: [] })).toBe('Upper A');
  });

  it('shows the name and the focuses together', () => {
    expect(formatWorkout({ workoutName: 'Push 1', focusNames: ['Chest', 'Shoulders', 'Triceps'] })).toBe(
      'Push 1 · Chest + Shoulders + Triceps',
    );
  });

  it('returns null when nothing is recorded, rather than an empty string', () => {
    expect(formatWorkout({ workoutName: null, focusNames: [] })).toBeNull();
    expect(formatWorkout({ workoutName: '   ', focusNames: [] })).toBeNull();
    expect(formatWorkout({ workoutName: null, focusNames: ['  '] })).toBeNull();
  });

  it('reports whether anything was recorded', () => {
    expect(hasWorkout({ workoutName: null, focusNames: ['Legs'] })).toBe(true);
    expect(hasWorkout({ workoutName: null, focusNames: [] })).toBe(false);
  });
});

describe('formatWorkoutShort', () => {
  it('truncates long focus lists for dense rows', () => {
    expect(
      formatWorkoutShort({
        workoutName: null,
        focusNames: ['Chest', 'Shoulders', 'Triceps', 'Abs/Core'],
      }),
    ).toBe('Chest + Shoulders + Triceps +1');
  });

  it('keeps short lists intact', () => {
    expect(formatWorkoutShort({ workoutName: null, focusNames: ['Back', 'Biceps'] })).toBe(
      'Back + Biceps',
    );
  });

  it('falls back to the name when there are no focuses', () => {
    expect(formatWorkoutShort({ workoutName: 'Lower B', focusNames: [] })).toBe('Lower B');
  });
});

describe('resolveFocuses', () => {
  it('returns catalogue order, not the order they were tapped', () => {
    const resolved = resolveFocuses(['triceps', 'chest'], catalogue);
    expect(resolved.map((f) => f.name)).toEqual(['Chest', 'Triceps']);
  });

  it('puts muscle groups before splits and conditioning', () => {
    const resolved = resolveFocuses(['cardio', 'push', 'chest'], catalogue);
    expect(resolved.map((f) => f.name)).toEqual(['Chest', 'Push', 'Cardio']);
  });

  it('drops ids that are not in the catalogue', () => {
    expect(resolveFocuses(['chest', 'nope'], catalogue).map((f) => f.id)).toEqual(['chest']);
  });

  it('handles an empty selection', () => {
    expect(resolveFocuses([], catalogue)).toEqual([]);
  });
});

describe('groupFocuses', () => {
  it('groups by category and hides inactive entries', () => {
    const groups = groupFocuses(catalogue);
    expect(groups.map((g) => g.category)).toEqual(['MUSCLE_GROUP', 'SPLIT', 'CONDITIONING']);
    expect(groups[1]!.focuses.map((f) => f.name)).toEqual(['Push']);
  });

  it('orders within a group by sortOrder', () => {
    const groups = groupFocuses(catalogue);
    expect(groups[0]!.focuses.map((f) => f.name)).toEqual(['Chest', 'Back', 'Biceps', 'Triceps']);
  });
});

describe('validation', () => {
  it('accepts a normal custom name', () => {
    expect(validateWorkoutName('Upper A').ok).toBe(true);
    expect(validateWorkoutName(null).ok).toBe(true);
    expect(validateWorkoutName('').ok).toBe(true);
  });

  it('rejects an absurdly long name', () => {
    expect(validateWorkoutName('x'.repeat(200)).ok).toBe(false);
  });

  it('accepts a multi-focus selection', () => {
    expect(validateFocusSelection(['chest', 'triceps']).ok).toBe(true);
  });

  it('rejects duplicates', () => {
    const result = validateFocusSelection(['chest', 'chest']);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/more than once/);
  });

  it('rejects an unreasonable number of focuses', () => {
    const many = Array.from({ length: MAX_FOCUSES_PER_DAY + 1 }, (_, i) => `f${i}`);
    expect(validateFocusSelection(many).ok).toBe(false);
  });
});

describe('focusFrequency', () => {
  const history = [
    { date: '2026-09-07', isTraining: true, workout: { workoutName: null, focusNames: ['Chest', 'Triceps'] } },
    { date: '2026-09-08', isTraining: true, workout: { workoutName: null, focusNames: ['Back', 'Biceps'] } },
    { date: '2026-09-09', isTraining: true, workout: { workoutName: null, focusNames: ['Chest', 'Shoulders'] } },
    { date: '2026-09-12', isTraining: false, workout: { workoutName: null, focusNames: ['Chest'] } },
    { date: '2026-09-13', isTraining: true, workout: { workoutName: null, focusNames: [] } },
  ];

  it('counts sessions per focus, most trained first', () => {
    const counts = focusFrequency(history);
    expect(counts[0]).toEqual({ name: 'Chest', sessions: 2 });
    expect(counts.find((c) => c.name === 'Triceps')?.sessions).toBe(1);
  });

  it('ignores rest days even if something was recorded on them', () => {
    // Chest appears on the rest day too, but is only counted twice.
    expect(focusFrequency(history).find((c) => c.name === 'Chest')?.sessions).toBe(2);
  });

  it('finds training days with nothing recorded', () => {
    expect(untrackedTrainingDays(history)).toEqual(['2026-09-13']);
  });
});

describe('timingDelta', () => {
  it('reports how late a meal was', () => {
    expect(timingDelta('15:30', '15:47')).toBe(17);
    expect(formatTimingDelta('15:30', '15:47')).toBe('17m late');
  });

  it('reports an early meal', () => {
    expect(timingDelta('15:30', '15:00')).toBe(-30);
    expect(formatTimingDelta('15:30', '15:00')).toBe('30m early');
  });

  it('stays quiet about a few minutes either way', () => {
    expect(formatTimingDelta('15:30', '15:33')).toBe('on time');
    expect(formatTimingDelta('15:30', '15:30')).toBe('on time');
  });

  it('handles a meal planned before midnight and eaten after', () => {
    // 23:00 planned, 00:20 eaten is 80 minutes late, not 22 hours early.
    expect(timingDelta('23:00', '00:20')).toBe(80);
    expect(formatTimingDelta('23:00', '00:20')).toBe('1h 20m late');
  });

  it('returns null when either time is missing or malformed', () => {
    expect(timingDelta(null, '15:47')).toBeNull();
    expect(timingDelta('15:30', null)).toBeNull();
    expect(timingDelta('nonsense', '15:47')).toBeNull();
    expect(formatTimingDelta(null, null)).toBeNull();
  });
});

/*
 * "An hour before my workout, and an hour and a half before any leg day."
 *
 * The rule lives on the focus row rather than in code, so nothing here knows
 * what a leg day is — a focus simply asks for a longer gap.
 */
describe('effectivePreWorkoutMinutes', () => {
  const legs = { preWorkoutMinutes: 90 };
  const chest = { preWorkoutMinutes: null };
  const calves = { preWorkoutMinutes: 90 };

  it('uses the default when nothing asks for longer', () => {
    expect(effectivePreWorkoutMinutes(60, [chest])).toBe(60);
  });

  it('uses the default on a day with no workout recorded', () => {
    expect(effectivePreWorkoutMinutes(60, [])).toBe(60);
  });

  it('lengthens the gap when a focus asks for one', () => {
    expect(effectivePreWorkoutMinutes(60, [legs])).toBe(90);
  });

  it('takes the longest when a session mixes focuses', () => {
    expect(effectivePreWorkoutMinutes(60, [chest, legs, calves])).toBe(90);
  });

  it('does not shorten the gap below the default', () => {
    // A focus asking for 30 on a day whose default is already 60 is a floor,
    // not a target: eating closer to training than usual is never the safer
    // reading of "1 hour before".
    expect(effectivePreWorkoutMinutes(60, [{ preWorkoutMinutes: 30 }])).toBe(60);
  });

  it('accepts a zero override without treating it as unset', () => {
    expect(effectivePreWorkoutMinutes(0, [{ preWorkoutMinutes: 0 }])).toBe(0);
  });

  it('ignores an undefined override', () => {
    expect(effectivePreWorkoutMinutes(60, [{}, { preWorkoutMinutes: undefined }])).toBe(60);
  });
});
