import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayRange,
  daysFrom,
  diffDays,
  endOfWeek,
  fromDbDate,
  isValidDayKey,
  isoWeekday,
  relativeDayLabel,
  startOfWeek,
  toDbDate,
  weekdayName,
} from '@/lib/domain/dates';
import {
  addMacros,
  derivedCalories,
  formatMacro,
  macrosForQuantity,
  scaleMacros,
  sumMacros,
} from '@/lib/domain/nutrition';
import {
  formatDose,
  materialiseDay,
  materialiseSupplements,
  type MaterialiseFood,
  type MaterialiseMeal,
  type SupplementLike,
} from '@/lib/domain/materialise';
import {
  allocatePortions,
  eatFirstOrder,
  storageActions,
  suggestedUseBy,
  summariseStorage,
  type StoredPortionLike,
} from '@/lib/domain/storage';
import { buildReminders, topReminder } from '@/lib/domain/reminders';

/* -------------------------------------------------------------------------- */

describe('dates', () => {
  it('validates day keys', () => {
    expect(isValidDayKey('2026-09-11')).toBe(true);
    expect(isValidDayKey('2026-02-30')).toBe(false);
    expect(isValidDayKey('11-09-2026')).toBe(false);
  });

  it('adds and diffs days across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-09-18', '2026-09-11')).toBe(7);
  });

  it('maps to ISO weekdays', () => {
    // 2026-09-11 is a Friday.
    expect(isoWeekday('2026-09-11')).toBe(5);
    expect(weekdayName(5)).toBe('Friday');
    expect(isoWeekday('2026-09-13')).toBe(7);
  });

  it('finds Monday-based week boundaries', () => {
    expect(startOfWeek('2026-09-11')).toBe('2026-09-07');
    expect(endOfWeek('2026-09-11')).toBe('2026-09-13');
    expect(startOfWeek('2026-09-13')).toBe('2026-09-07');
  });

  it('builds ranges', () => {
    expect(dayRange('2026-09-11', '2026-09-13')).toEqual(['2026-09-11', '2026-09-12', '2026-09-13']);
    expect(daysFrom('2026-09-11', 3)).toHaveLength(3);
    expect(daysFrom('2026-09-11', 0)).toHaveLength(0);
  });

  it('round-trips through the Postgres date representation without shifting', () => {
    const key = '2026-09-11';
    expect(fromDbDate(toDbDate(key))).toBe(key);
    expect(toDbDate(key).toISOString()).toBe('2026-09-11T00:00:00.000Z');
  });

  it('labels days relative to today', () => {
    expect(relativeDayLabel('2026-09-11', '2026-09-11')).toBe('Today');
    expect(relativeDayLabel('2026-09-12', '2026-09-11')).toBe('Tomorrow');
    expect(relativeDayLabel('2026-09-10', '2026-09-11')).toBe('Yesterday');
  });
});

/* -------------------------------------------------------------------------- */

describe('nutrition', () => {
  const chicken = { basisQty: 100, basisUnit: 'g', calories: 165, protein: 31, carbs: 0, fat: 3.6 };

  it('scales macros to a portion', () => {
    const macros = macrosForQuantity(chicken, 175, 'g');
    expect(macros.calories).toBe(288.75);
    expect(macros.protein).toBe(54.25);
    expect(macros.fibre).toBeNull();
  });

  it('converts compatible units before scaling', () => {
    expect(macrosForQuantity(chicken, 0.2, 'kg').calories).toBe(330);
  });

  it('returns unknown rather than zero when units cannot be converted', () => {
    expect(macrosForQuantity(chicken, 2, 'each').calories).toBeNull();
  });

  it('returns unknown when a food has no nutrition entered', () => {
    expect(macrosForQuantity(null, 100, 'g').calories).toBeNull();
  });

  it('returns unknown, not zero, for a quantity that is not a number', () => {
    // round() turns a non-finite result into 0, so without an explicit guard an
    // unusable quantity was snapshotted into the day as "0 kcal" — which reads
    // as a food with no calories rather than a number nobody could work out.
    for (const quantity of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const macros = macrosForQuantity(chicken, quantity, 'g');
      expect(macros.calories).toBeNull();
      expect(macros.protein).toBeNull();
    }
  });

  it('returns unknown when the nutrition basis is not a number', () => {
    const broken = { basisQty: Number.NaN, basisUnit: 'g', calories: 165 };
    expect(macrosForQuantity(broken, 100, 'g').calories).toBeNull();
  });

  it('sums macros and reports what is missing', () => {
    const totals = sumMacros([
      { name: 'Rice', macros: macrosForQuantity({ basisQty: 100, basisUnit: 'g', calories: 130, protein: 2.7 }, 225, 'g') },
      { name: 'Chicken', macros: macrosForQuantity(chicken, 175, 'g') },
      { name: 'Mystery sauce', macros: macrosForQuantity(null, 20, 'g') },
    ]);
    expect(totals.calories).toBe(581.25);
    expect(totals.missing).toEqual(['Mystery sauce']);
    expect(totals.complete).toBe(false);
    expect(totals.itemsWithData).toBe(2);
  });

  it('treats a fully known meal as complete', () => {
    const totals = sumMacros([{ name: 'Chicken', macros: macrosForQuantity(chicken, 100, 'g') }]);
    expect(totals.complete).toBe(true);
  });

  it('adds and scales macro sets, preserving unknowns', () => {
    const a = macrosForQuantity(chicken, 100, 'g');
    const b = macrosForQuantity(chicken, 100, 'g');
    expect(addMacros(a, b).calories).toBe(330);
    expect(addMacros(a, b).fibre).toBeNull();
    expect(scaleMacros(a, 2).protein).toBe(62);
  });

  it('derives calories from macros when they were not entered', () => {
    expect(derivedCalories({ calories: null, protein: 30, carbs: 40, fat: 10, fibre: null, sodium: null })).toBe(370);
    expect(derivedCalories({ calories: null, protein: null, carbs: null, fat: null, fibre: null, sodium: null })).toBeNull();
  });

  it('formats macros, showing a dash for unknown', () => {
    expect(formatMacro('protein', 54.25)).toBe('54.3 g');
    expect(formatMacro('calories', 288.75)).toBe('289 kcal');
    expect(formatMacro('fibre', null)).toBe('—');
  });
});

/* -------------------------------------------------------------------------- */

describe('materialiseDay', () => {
  const TRAINING = 'training';
  const REST = 'rest';

  const foods: Record<string, MaterialiseFood> = {
    rice: {
      id: 'rice',
      name: 'White rice',
      category: 'CARBOHYDRATE',
      defaultUnit: 'g',
      tracksYield: true,
      nutrition: { basisQty: 100, basisUnit: 'g', calories: 130, protein: 2.7 },
    },
    chicken: { id: 'chicken', name: 'Chicken breast', category: 'PROTEIN', defaultUnit: 'g', tracksYield: true },
    turkey: { id: 'turkey', name: 'Ground turkey', category: 'PROTEIN', defaultUnit: 'g', tracksYield: true },
  };

  const plan: MaterialiseMeal[] = [
    {
      id: 'm5',
      name: 'Meal 5',
      sortOrder: 4,
      defaultTime: '23:00',
      isPreWorkout: false,
      includedDayTypeIds: [TRAINING, REST],
      ingredients: [
        {
          id: 'i-rice',
          foodId: 'rice',
          optionGroupId: null,
          unit: 'g',
          state: 'COOKED',
          required: true,
          quantityByDayType: { [TRAINING]: 150, [REST]: 0 },
        },
        {
          id: 'i-protein',
          foodId: null,
          optionGroupId: 'grp',
          optionGroupName: 'Meal 5 protein',
          unit: 'g',
          state: 'COOKED',
          required: true,
          quantityByDayType: { [TRAINING]: 175, [REST]: 175 },
        },
      ],
    },
  ];

  it('produces the training-day version of a meal', () => {
    const { meals } = materialiseDay({
      meals: plan,
      dayTypeId: TRAINING,
      foods,
      optionPreferences: { grp: 'chicken' },
    });
    expect(meals[0]!.items.map((i) => [i.foodName, i.quantity])).toEqual([
      ['White rice', 150],
      ['Chicken breast', 175],
    ]);
    expect(meals[0]!.scheduledTime).toBe('23:00');
  });

  it('drops zero-quantity lines on a rest day', () => {
    const { meals } = materialiseDay({
      meals: plan,
      dayTypeId: REST,
      foods,
      optionPreferences: { grp: 'chicken' },
    });
    expect(meals[0]!.items.map((i) => i.foodName)).toEqual(['Chicken breast']);
  });

  it('snapshots macros at generation time', () => {
    const { meals } = materialiseDay({
      meals: plan,
      dayTypeId: TRAINING,
      foods,
      optionPreferences: { grp: 'chicken' },
    });
    expect(meals[0]!.items[0]!.macros.calories).toBe(195);
  });

  it('follows the substitution preference', () => {
    const { meals } = materialiseDay({
      meals: plan,
      dayTypeId: TRAINING,
      foods,
      optionPreferences: { grp: 'turkey' },
    });
    expect(meals[0]!.items[1]!.foodName).toBe('Ground turkey');
  });

  it('excludes meals that do not apply to the day type', () => {
    const { meals } = materialiseDay({
      meals: plan.map((m) => ({ ...m, includedDayTypeIds: [TRAINING] })),
      dayTypeId: REST,
      foods,
      optionPreferences: { grp: 'chicken' },
    });
    expect(meals).toHaveLength(0);
  });

  it('warns when an option group has no selection', () => {
    const { warnings } = materialiseDay({ meals: plan, dayTypeId: TRAINING, foods });
    expect(warnings.join(' ')).toMatch(/no food selected/);
  });

  it('prefers a per-day-type time override', () => {
    const { meals } = materialiseDay({
      meals: plan.map((m) => ({ ...m, timeOverrides: { [TRAINING]: '22:00' } })),
      dayTypeId: TRAINING,
      foods,
      optionPreferences: { grp: 'chicken' },
    });
    expect(meals[0]!.scheduledTime).toBe('22:00');
  });
});

/* -------------------------------------------------------------------------- */

describe('materialiseSupplements', () => {
  const supplements: SupplementLike[] = [
    {
      id: 'multi',
      name: 'Multivitamin',
      countPerDose: 1,
      form: 'TABLET',
      active: true,
      sortOrder: 0,
      schedules: [{ id: 's1', timing: 'AM', applicability: 'EVERY_DAY', sortOrder: 0 }],
    },
    {
      id: 'creatine',
      name: 'Creatine monohydrate',
      dosageAmount: 5,
      dosageUnit: 'g',
      countPerDose: 1,
      form: 'SCOOP',
      active: true,
      sortOrder: 1,
      schedules: [{ id: 's2', timing: 'PRE_WORKOUT', applicability: 'EVERY_DAY', sortOrder: 1 }],
    },
    {
      id: 'training-only',
      name: 'Intra-workout',
      countPerDose: 1,
      form: 'SCOOP',
      active: true,
      sortOrder: 2,
      schedules: [{ id: 's3', timing: 'PRE_WORKOUT', applicability: 'TRAINING_ONLY', sortOrder: 2 }],
    },
    {
      id: 'inactive',
      name: 'Retired supplement',
      countPerDose: 1,
      form: 'CAPSULE',
      active: false,
      sortOrder: 3,
      schedules: [{ id: 's4', timing: 'AM', applicability: 'EVERY_DAY', sortOrder: 3 }],
    },
  ];

  it('includes training-only doses on a training day', () => {
    const doses = materialiseSupplements(supplements, true);
    expect(doses.map((d) => d.name)).toEqual(['Multivitamin', 'Creatine monohydrate', 'Intra-workout']);
  });

  it('excludes training-only doses on a rest day', () => {
    const doses = materialiseSupplements(supplements, false);
    expect(doses.map((d) => d.name)).toEqual(['Multivitamin', 'Creatine monohydrate']);
  });

  it('excludes inactive supplements', () => {
    expect(materialiseSupplements(supplements, true).some((d) => d.name === 'Retired supplement')).toBe(false);
  });

  it('orders by timing, morning first', () => {
    expect(materialiseSupplements(supplements, true)[0]!.timing).toBe('AM');
  });

  it('expands one supplement with two schedules into two doses', () => {
    const twice: SupplementLike[] = [
      {
        ...supplements[0]!,
        schedules: [
          { id: 'a', timing: 'AM', applicability: 'EVERY_DAY', sortOrder: 0 },
          { id: 'b', timing: 'BEFORE_BED', applicability: 'EVERY_DAY', sortOrder: 1 },
        ],
      },
    ];
    expect(materialiseSupplements(twice, true)).toHaveLength(2);
  });
});

describe('formatDose', () => {
  it('shows dosage and count', () => {
    expect(formatDose({ dosageAmount: 3000, dosageUnit: 'IU', countPerDose: 1, form: 'SOFTGEL' })).toBe('3000 IU');
    expect(formatDose({ countPerDose: 2, form: 'TABLET' })).toBe('2 tablets');
    expect(formatDose({ dosageAmount: 5, dosageUnit: 'g', countPerDose: 2, form: 'SCOOP' })).toBe('5 g · 2 scoops');
    expect(formatDose({ countPerDose: 1, form: 'CAPSULE' })).toBe('1 capsule');
  });
});

/* -------------------------------------------------------------------------- */

describe('storage planning', () => {
  const settings = { fridgeDays: 3, freezerThawLeadDays: 1 };

  it('keeps the first few days in the fridge and freezes the rest', () => {
    const allocations = allocatePortions('2026-09-13', 7, 1, settings);
    expect(allocations).toHaveLength(7);
    expect(allocations.slice(0, 3).every((a) => a.location === 'FRIDGE')).toBe(true);
    expect(allocations.slice(3).every((a) => a.location === 'FREEZER')).toBe(true);
  });

  it('sets a thaw date one day before a frozen portion is needed', () => {
    const allocations = allocatePortions('2026-09-13', 7, 1, settings);
    const first = allocations[3]!;
    expect(first.useByDate).toBe('2026-09-16');
    expect(first.thawOn).toBe('2026-09-15');
  });

  it('groups portions eaten on the same day', () => {
    const allocations = allocatePortions('2026-09-13', 14, 2, settings);
    expect(allocations).toHaveLength(7);
    expect(allocations[0]!.portions).toBe(2);
  });

  it('handles zero portions', () => {
    expect(allocatePortions('2026-09-13', 0, 1, settings)).toHaveLength(0);
  });

  const portions: StoredPortionLike[] = [
    {
      id: 'p1',
      label: 'Chicken x2',
      portions: 2,
      location: 'FREEZER',
      status: 'FROZEN',
      prepDate: '2026-09-13',
      thawOn: '2026-09-15',
      useByDate: '2026-09-16',
    },
    {
      id: 'p2',
      label: 'Chicken x1',
      portions: 1,
      location: 'FRIDGE',
      status: 'READY',
      prepDate: '2026-09-13',
      thawOn: null,
      useByDate: '2026-09-15',
    },
    {
      id: 'p3',
      label: 'Old beef',
      portions: 1,
      location: 'FRIDGE',
      status: 'READY',
      prepDate: '2026-09-08',
      thawOn: null,
      useByDate: '2026-09-11',
    },
    {
      id: 'p4',
      label: 'Eaten',
      portions: 1,
      location: 'FRIDGE',
      status: 'CONSUMED',
      prepDate: '2026-09-08',
      thawOn: null,
      useByDate: '2026-09-10',
    },
  ];

  it('tells you what to move to the fridge tonight', () => {
    const actions = storageActions(portions, '2026-09-15');
    const move = actions.find((a) => a.kind === 'MOVE_TO_FRIDGE');
    expect(move?.message).toMatch(/freezer to the fridge tonight/);
  });

  it('flags overdue and eat-today portions first', () => {
    const actions = storageActions(portions, '2026-09-15');
    expect(actions[0]!.kind).toBe('EXPIRED');
    expect(actions.some((a) => a.kind === 'EAT_FIRST')).toBe(true);
  });

  it('ignores consumed portions', () => {
    const actions = storageActions(portions, '2026-09-15');
    expect(actions.some((a) => a.portion.id === 'p4')).toBe(false);
  });

  it('orders eat-first by soonest use-by', () => {
    expect(eatFirstOrder(portions).map((p) => p.id)).toEqual(['p3', 'p2', 'p1']);
  });

  it('summarises the storage dashboard', () => {
    const summary = summariseStorage(portions, '2026-09-15');
    expect(summary.fridgePortions).toBe(2);
    expect(summary.freezerPortions).toBe(2);
    expect(summary.moveToFridgeCount).toBe(1);
    expect(summary.expiredCount).toBe(1);
  });

  it('suggests a use-by date per location', () => {
    expect(suggestedUseBy('2026-09-13', 'FRIDGE', settings)).toBe('2026-09-16');
    expect(suggestedUseBy('2026-09-13', 'FREEZER', settings)).toBe('2026-12-12');
  });
});

/* -------------------------------------------------------------------------- */

describe('reminders', () => {
  const base = {
    nowTime: '16:00',
    today: '2026-09-15',
    meals: [
      { id: 'm1', name: 'Meal 1', status: 'COMPLETED', scheduledTime: '13:00' },
      { id: 'm2', name: 'Meal 2', status: 'PENDING', scheduledTime: '15:30' },
      { id: 'm3', name: 'Meal 3', status: 'PENDING', scheduledTime: '17:30' },
    ],
    supplements: [],
    water: { totalMl: 3000, targetMl: 4000 },
    storage: [],
  };

  it('flags an overdue meal', () => {
    const reminders = buildReminders(base);
    const overdue = reminders.find((r) => r.kind === 'MEAL_OVERDUE');
    expect(overdue?.title).toBe('Meal 2 is overdue');
    expect(overdue?.severity).toBe('overdue');
  });

  it('flags an upcoming meal only inside the lead window', () => {
    expect(buildReminders(base).some((r) => r.kind === 'MEAL_DUE')).toBe(false);
    expect(buildReminders({ ...base, nowTime: '17:20' }).some((r) => r.kind === 'MEAL_DUE')).toBe(true);
  });

  it('does not nag when water is on pace', () => {
    expect(buildReminders(base).some((r) => r.kind === 'WATER_BEHIND')).toBe(false);
  });

  it('flags water when well behind pace', () => {
    const reminders = buildReminders({ ...base, water: { totalMl: 200, targetMl: 4000 } });
    expect(reminders.some((r) => r.kind === 'WATER_BEHIND')).toBe(true);
  });

  it('reminds you to move food to the fridge', () => {
    const reminders = buildReminders({
      ...base,
      storage: [{ id: 'p1', label: 'Chicken x2', thawOn: '2026-09-15', status: 'FROZEN' }],
    });
    expect(reminders.some((r) => r.kind === 'MOVE_TO_FRIDGE')).toBe(true);
  });

  it('reminds about a prep day today and tomorrow', () => {
    const today = buildReminders({ ...base, prepSession: { id: 'p', name: 'Sunday prep', date: '2026-09-15' } });
    expect(today.find((r) => r.kind === 'PREP_DAY')?.title).toBe('Prep day is today');

    const tomorrow = buildReminders({ ...base, prepSession: { id: 'p', name: 'Sunday prep', date: '2026-09-16' } });
    expect(tomorrow.find((r) => r.kind === 'PREP_DAY')?.title).toBe('Prep day tomorrow');
  });

  it('collapses low stock into one reminder', () => {
    // A fresh install has every seeded inventory item at zero; one card per
    // item would bury the reminders that actually matter.
    const reminders = buildReminders({
      ...base,
      lowStock: [
        { id: 'a', name: 'White rice', quantity: 0, unit: 'g' },
        { id: 'b', name: 'Oats', quantity: 0, unit: 'g' },
        { id: 'c', name: 'IsoWhey', quantity: 0, unit: 'g' },
        { id: 'd', name: 'Eggs', quantity: 0, unit: 'each' },
      ],
    });

    const lowStock = reminders.filter((r) => r.kind === 'LOW_STOCK');
    expect(lowStock).toHaveLength(1);
    expect(lowStock[0]!.title).toBe('4 items low on stock');
    expect(lowStock[0]!.body).toBe('White rice, Oats, IsoWhey and 1 more');
  });

  it('names the item when only one is low', () => {
    const reminders = buildReminders({
      ...base,
      lowStock: [{ id: 'a', name: 'Oats', quantity: 0, unit: 'g' }],
    });
    expect(reminders.find((r) => r.kind === 'LOW_STOCK')?.title).toBe('Low stock: Oats');
  });

  it('surfaces the most urgent reminder first', () => {
    const reminders = buildReminders({ ...base, water: { totalMl: 0, targetMl: 4000 } });
    expect(topReminder(reminders)?.kind).toBe('MEAL_OVERDUE');
    expect(topReminder([])).toBeNull();
  });
});
