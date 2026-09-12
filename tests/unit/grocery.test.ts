import { describe, expect, it } from 'vitest';
import {
  applyInventory,
  cookingRequirements,
  estimatePackages,
  generateGroceryList,
  groupByCategory,
  groupByDepartment,
  resolveIngredientFood,
  type FoodInfo,
  type GroceryGenerationInput,
  type PlanMeal,
} from '@/lib/domain/grocery';

const TRAINING = 'dt-training';
const REST = 'dt-rest';

const foods: Record<string, FoodInfo> = {
  rice: {
    id: 'rice',
    name: 'White rice',
    category: 'CARBOHYDRATE',
    defaultUnit: 'g',
    department: 'Dry Goods',
    packageSize: 5000,
    packageUnit: 'g',
    cookingYieldPct: 300,
    tracksYield: true,
  },
  chicken: {
    id: 'chicken',
    name: 'Chicken breast',
    category: 'PROTEIN',
    defaultUnit: 'g',
    department: 'Meat & Seafood',
    packageSize: 1000,
    packageUnit: 'g',
    cookingYieldPct: 75,
    tracksYield: true,
  },
  turkey: {
    id: 'turkey',
    name: 'Ground turkey',
    category: 'PROTEIN',
    defaultUnit: 'g',
    department: 'Meat & Seafood',
    packageSize: 500,
    packageUnit: 'g',
    cookingYieldPct: 78,
    tracksYield: true,
  },
  veg: {
    id: 'veg',
    name: 'Frozen mixed vegetables',
    category: 'VEGETABLE',
    defaultUnit: 'g',
    department: 'Frozen',
    packageSize: 1000,
    packageUnit: 'g',
    tracksYield: false,
  },
  bagel: {
    id: 'bagel',
    name: 'Bagels',
    category: 'CARBOHYDRATE',
    defaultUnit: 'each',
    department: 'Bakery',
    packageSize: 6,
    packageUnit: 'each',
    tracksYield: false,
  },
  lamb: {
    id: 'lamb',
    name: 'Lamb',
    category: 'PROTEIN',
    defaultUnit: 'g',
    department: 'Meat & Seafood',
    tracksYield: true,
    cookingYieldPct: null,
  },
};

const proteinGroup = 'grp-protein';

function meal(id: string, name: string, ingredients: PlanMeal['ingredients'], dayTypes = [TRAINING, REST]): PlanMeal {
  return { id, name, includedDayTypeIds: dayTypes, ingredients };
}

/** The seeded plan, reduced to the parts that matter for aggregation. */
const defaultPlan: PlanMeal[] = [
  meal('m1', 'Meal 1', [
    {
      id: 'i-bagel',
      foodId: 'bagel',
      optionGroupId: null,
      unit: 'each',
      state: 'AS_IS',
      required: true,
      quantityByDayType: { [TRAINING]: 2, [REST]: 1 },
    },
  ]),
  meal('m2', 'Meal 2', [
    {
      id: 'i-rice-2',
      foodId: 'rice',
      optionGroupId: null,
      unit: 'g',
      state: 'COOKED',
      required: true,
      quantityByDayType: { [TRAINING]: 225, [REST]: 175 },
    },
    {
      id: 'i-protein-2',
      foodId: null,
      optionGroupId: proteinGroup,
      optionGroupName: 'Meal 2 & 4 protein',
      unit: 'g',
      state: 'COOKED',
      required: true,
      quantityByDayType: { [TRAINING]: 175, [REST]: 175 },
    },
    {
      id: 'i-veg-2',
      foodId: 'veg',
      optionGroupId: null,
      unit: 'g',
      state: 'COOKED',
      required: true,
      quantityByDayType: { [TRAINING]: 100, [REST]: 100 },
    },
  ]),
  meal('m4', 'Meal 4', [
    {
      id: 'i-rice-4',
      foodId: 'rice',
      optionGroupId: null,
      unit: 'g',
      state: 'COOKED',
      required: true,
      quantityByDayType: { [TRAINING]: 225, [REST]: 175 },
    },
    {
      id: 'i-protein-4',
      foodId: null,
      optionGroupId: proteinGroup,
      optionGroupName: 'Meal 2 & 4 protein',
      unit: 'g',
      state: 'COOKED',
      required: true,
      quantityByDayType: { [TRAINING]: 175, [REST]: 175 },
    },
    {
      id: 'i-veg-4',
      foodId: 'veg',
      optionGroupId: null,
      unit: 'g',
      state: 'COOKED',
      required: true,
      quantityByDayType: { [TRAINING]: 100, [REST]: 100 },
    },
  ]),
  meal('m5', 'Meal 5', [
    {
      id: 'i-rice-5',
      foodId: 'rice',
      optionGroupId: null,
      unit: 'g',
      state: 'COOKED',
      required: true,
      // No rice on rest days.
      quantityByDayType: { [TRAINING]: 150, [REST]: 0 },
    },
    {
      id: 'i-veg-5',
      foodId: 'veg',
      optionGroupId: null,
      unit: 'g',
      state: 'COOKED',
      required: true,
      quantityByDayType: { [TRAINING]: 100, [REST]: 100 },
    },
  ]),
];

const baseInput: GroceryGenerationInput = {
  meals: defaultPlan,
  dayTypeCounts: [
    { dayTypeId: TRAINING, dayTypeName: 'Training', days: 5 },
    { dayTypeId: REST, dayTypeName: 'Rest', days: 2 },
  ],
  foods,
  optionPreferences: { [proteinGroup]: 'chicken' },
};

const lineFor = (input: GroceryGenerationInput, name: string) => {
  const line = generateGroceryList(input).lines.find((l) => l.name === name);
  if (!line) throw new Error(`No grocery line for ${name}`);
  return line;
};

describe('resolveIngredientFood', () => {
  it('prefers the option group selection over the fixed food', () => {
    const ingredient = defaultPlan[1]!.ingredients[1]!;
    expect(resolveIngredientFood(ingredient, { [proteinGroup]: 'turkey' })).toBe('turkey');
  });

  it('returns null when a group has no selection', () => {
    const ingredient = defaultPlan[1]!.ingredients[1]!;
    expect(resolveIngredientFood(ingredient, {})).toBeNull();
  });
});

describe('generateGroceryList aggregation', () => {
  it('aggregates one food across several meals and day types', () => {
    // Meal 2: 225x5 + 175x2 = 1475; Meal 4 the same; Meal 5: 150x5 + 0x2 = 750.
    const rice = lineFor(baseInput, 'White rice');
    expect(rice.requiredQty).toBe(1475 + 1475 + 750);
    expect(rice.cookedQty).toBe(3700);
  });

  it('respects per-day-type quantities including zero', () => {
    const restOnly: GroceryGenerationInput = {
      ...baseInput,
      dayTypeCounts: [{ dayTypeId: REST, dayTypeName: 'Rest', days: 7 }],
    };
    // Meal 5 contributes no rice at all on rest days.
    expect(lineFor(restOnly, 'White rice').requiredQty).toBe(175 * 7 * 2);
  });

  it('aggregates count units without converting them to mass', () => {
    const bagels = lineFor(baseInput, 'Bagels');
    expect(bagels.requiredQty).toBe(2 * 5 + 1 * 2);
    expect(bagels.requiredUnit).toBe('each');
  });

  it('totals vegetables across all three meals', () => {
    expect(lineFor(baseInput, 'Frozen mixed vegetables').requiredQty).toBe(100 * 3 * 7);
  });

  it('reports the number of days planned', () => {
    expect(generateGroceryList(baseInput).totalDays).toBe(7);
  });
});

describe('generateGroceryList raw conversion', () => {
  it('converts cooked chicken to a raw purchase weight', () => {
    const chicken = lineFor(baseInput, 'Chicken breast');
    expect(chicken.cookedQty).toBe(2450);
    expect(chicken.rawQty).toBe(3266.67);
    expect(chicken.shoppingQty).toBe(3266.67);
    expect(chicken.yieldPctUsed).toBe(75);
  });

  it('converts cooked rice to dry rice', () => {
    const rice = lineFor(baseInput, 'White rice');
    expect(rice.shoppingQty).toBe(1233.33);
  });

  it('follows the substitution preference', () => {
    const turkeyInput = { ...baseInput, optionPreferences: { [proteinGroup]: 'turkey' } };
    const turkey = lineFor(turkeyInput, 'Ground turkey');
    expect(turkey.cookedQty).toBe(2450);
    expect(turkey.yieldPctUsed).toBe(78);
    expect(turkey.shoppingQty).toBe(3141.03);
    expect(generateGroceryList(turkeyInput).lines.find((l) => l.name === 'Chicken breast')).toBeUndefined();
  });

  it('does not convert foods that do not track a yield', () => {
    const veg = lineFor(baseInput, 'Frozen mixed vegetables');
    expect(veg.rawQty).toBeNull();
    expect(veg.shoppingQty).toBe(veg.requiredQty);
  });

  it('warns rather than guessing when a yield is missing', () => {
    const input: GroceryGenerationInput = {
      ...baseInput,
      meals: [
        meal('m9', 'Meal 9', [
          {
            id: 'i-lamb',
            foodId: 'lamb',
            optionGroupId: null,
            unit: 'g',
            state: 'COOKED',
            required: true,
            quantityByDayType: { [TRAINING]: 175, [REST]: 175 },
          },
        ]),
      ],
    };
    const result = generateGroceryList(input);
    const lamb = result.lines.find((l) => l.name === 'Lamb')!;
    expect(lamb.missingYield).toBe(true);
    expect(lamb.shoppingQty).toBe(1225);
    expect(result.warnings.join(' ')).toMatch(/no cooking yield/);
  });
});

describe('generateGroceryList edge cases', () => {
  it('omits optional ingredients when asked', () => {
    const input: GroceryGenerationInput = {
      ...baseInput,
      includeOptional: false,
      meals: [
        meal('m0', 'Meal 0', [
          {
            id: 'i-salt',
            foodId: 'veg',
            optionGroupId: null,
            unit: 'g',
            state: 'AS_IS',
            required: false,
            quantityByDayType: { [TRAINING]: 10, [REST]: 10 },
          },
        ]),
      ],
    };
    expect(generateGroceryList(input).lines).toHaveLength(0);
  });

  it('skips a meal that does not apply to a day type', () => {
    const trainingOnlyMeal = meal(
      'm-training',
      'Training only',
      [
        {
          id: 'i-veg-t',
          foodId: 'veg',
          optionGroupId: null,
          unit: 'g',
          state: 'AS_IS',
          required: true,
          quantityByDayType: { [TRAINING]: 100, [REST]: 100 },
        },
      ],
      [TRAINING],
    );
    const result = generateGroceryList({ ...baseInput, meals: [trainingOnlyMeal] });
    expect(result.lines[0]!.requiredQty).toBe(500);
  });

  it('warns when an option group has no food chosen', () => {
    const result = generateGroceryList({ ...baseInput, optionPreferences: {} });
    expect(result.warnings.join(' ')).toMatch(/no food selected/);
  });

  it('ignores zero day counts', () => {
    const result = generateGroceryList({
      ...baseInput,
      dayTypeCounts: [
        { dayTypeId: TRAINING, dayTypeName: 'Training', days: 0 },
        { dayTypeId: REST, dayTypeName: 'Rest', days: 7 },
      ],
    });
    expect(result.totalDays).toBe(7);
    expect(result.lines.find((l) => l.name === 'Bagels')!.requiredQty).toBe(7);
  });

  it('sums mixed compatible units into the food default unit', () => {
    const input: GroceryGenerationInput = {
      ...baseInput,
      meals: [
        meal('mA', 'Meal A', [
          {
            id: 'i-a',
            foodId: 'veg',
            optionGroupId: null,
            unit: 'kg',
            state: 'AS_IS',
            required: true,
            quantityByDayType: { [TRAINING]: 1, [REST]: 1 },
          },
          {
            id: 'i-b',
            foodId: 'veg',
            optionGroupId: null,
            unit: 'g',
            state: 'AS_IS',
            required: true,
            quantityByDayType: { [TRAINING]: 500, [REST]: 500 },
          },
        ]),
      ],
    };
    // 7 kg + 3500 g = 10500 g
    expect(lineFor(input, 'Frozen mixed vegetables').requiredQty).toBe(10500);
  });

  it('records which meals contributed to a line', () => {
    const rice = lineFor(baseInput, 'White rice');
    expect(rice.sources.map((s) => s.mealName)).toEqual(
      expect.arrayContaining(['Meal 2', 'Meal 4', 'Meal 5']),
    );
  });
});

describe('inventory subtraction', () => {
  it('subtracts matching inventory in a convertible unit', () => {
    const result = generateGroceryList({
      ...baseInput,
      inventory: [{ foodId: 'veg', name: 'Frozen mixed vegetables', quantity: 1, unit: 'kg' }],
    });
    const veg = result.lines.find((l) => l.name === 'Frozen mixed vegetables')!;
    expect(veg.inventoryQty).toBe(1000);
    expect(veg.shoppingQty).toBe(2100 - 1000);
  });

  it('never goes below zero', () => {
    const { lines } = applyInventory(
      [
        {
          key: 'food:veg',
          foodId: 'veg',
          name: 'Frozen mixed vegetables',
          category: 'VEGETABLE',
          department: 'Frozen',
          requiredQty: 500,
          requiredUnit: 'g',
          cookedQty: null,
          rawQty: null,
          rawForCookedQty: null,
          yieldPctUsed: null,
          missingYield: false,
          shoppingQty: 500,
          shoppingUnit: 'g',
          inventoryQty: null,
          inventoryNote: null,
          packageSize: null,
          packageUnit: null,
          estimatedPackages: null,
          sources: [],
        },
      ],
      [{ foodId: 'veg', name: 'Frozen mixed vegetables', quantity: 5, unit: 'kg' }],
    );
    expect(lines[0]!.shoppingQty).toBe(0);
  });

  it('notes rather than subtracts when units cannot be converted', () => {
    const result = generateGroceryList({
      ...baseInput,
      inventory: [{ foodId: 'veg', name: 'Frozen mixed vegetables', quantity: 2, unit: 'pack' }],
    });
    const veg = result.lines.find((l) => l.name === 'Frozen mixed vegetables')!;
    expect(veg.inventoryQty).toBeNull();
    expect(veg.shoppingQty).toBe(2100);
    expect(veg.inventoryNote).toMatch(/could not be converted/);
  });

  it('ignores inventory for a different food', () => {
    const result = generateGroceryList({
      ...baseInput,
      inventory: [{ foodId: 'bagel', name: 'Bagels', quantity: 12, unit: 'each' }],
    });
    expect(result.lines.find((l) => l.name === 'Frozen mixed vegetables')!.shoppingQty).toBe(2100);
    expect(result.lines.find((l) => l.name === 'Bagels')!.shoppingQty).toBe(0);
  });
});

describe('estimatePackages', () => {
  const line = lineFor(baseInput, 'Chicken breast');

  it('rounds up to whole packages', () => {
    // 3266.67 g of chicken in 1000 g packs is 4 packs.
    expect(line.estimatedPackages).toBe(4);
  });

  it('omits the estimate when no package size is known', () => {
    expect(estimatePackages({ ...line, packageSize: null, packageUnit: null }).estimatedPackages).toBeNull();
  });

  it('omits the estimate when the package unit is incompatible', () => {
    expect(
      estimatePackages({ ...line, packageSize: 6, packageUnit: 'each' }).estimatedPackages,
    ).toBeNull();
  });

  it('estimates count-unit packages', () => {
    const bagels = lineFor(baseInput, 'Bagels');
    expect(bagels.requiredQty).toBe(12);
    expect(bagels.estimatedPackages).toBe(2);
  });
});

describe('grouping', () => {
  it('groups by category in a fixed shopping order', () => {
    const groups = groupByCategory(generateGroceryList(baseInput).lines);
    expect(groups.map((g) => g.category)).toEqual(['PROTEIN', 'CARBOHYDRATE', 'VEGETABLE']);
  });

  it('groups by department and falls back to the category label', () => {
    const groups = groupByDepartment([
      { department: 'Frozen', category: 'VEGETABLE' as const },
      { department: null, category: 'PROTEIN' as const },
    ]);
    expect(groups.map((g) => g.department).sort()).toEqual(['Frozen', 'Protein']);
  });
});

describe('cookingRequirements', () => {
  it('lists what must be cooked, in cooked weights', () => {
    const requirements = cookingRequirements(baseInput);
    const chicken = requirements.find((r) => r.foodName === 'Chicken breast')!;
    expect(chicken.cookedQty).toBe(2450);
    expect(chicken.rawQty).toBe(3266.67);

    // Bagels are not cooked, so they never appear here.
    expect(requirements.find((r) => r.foodName === 'Bagels')).toBeUndefined();
  });

  it('tells the cook the raw weight for the batch, not the shopping total', () => {
    // The same food two ways in one day: 175 g cooked in one meal and 100 g
    // bought raw in another. Shopping needs 175/0.75 + 100 = 333.33 g; the pan
    // needs only the 233.33 g that cooks down to 175 g.
    const input: GroceryGenerationInput = {
      meals: [
        {
          id: 'm1',
          name: 'Cooked meal',
          includedDayTypeIds: [TRAINING],
          ingredients: [
            {
              id: 'i1',
              foodId: 'chicken',
              optionGroupId: null,
              unit: 'g',
              state: 'COOKED',
              required: true,
              quantityByDayType: { [TRAINING]: 175 },
            },
          ],
        },
        {
          id: 'm2',
          name: 'Raw meal',
          includedDayTypeIds: [TRAINING],
          ingredients: [
            {
              id: 'i2',
              foodId: 'chicken',
              optionGroupId: null,
              unit: 'g',
              state: 'RAW',
              required: true,
              quantityByDayType: { [TRAINING]: 100 },
            },
          ],
        },
      ],
      dayTypeCounts: [{ dayTypeId: TRAINING, dayTypeName: 'Training', days: 1 }],
      foods,
    };

    const line = generateGroceryList(input).lines.find((l) => l.name === 'Chicken breast')!;
    expect(line.cookedQty).toBe(175);
    expect(line.shoppingQty).toBe(333.33);
    expect(line.rawQty).toBe(333.33);
    expect(line.rawForCookedQty).toBe(233.33);

    const requirement = cookingRequirements(input).find((r) => r.foodName === 'Chicken breast')!;
    expect(requirement.cookedQty).toBe(175);
    expect(requirement.rawQty).toBe(233.33);
  });

  it('leaves the raw weight unknown when the yield is missing', () => {
    const noYield: GroceryGenerationInput = {
      ...baseInput,
      foods: { ...foods, chicken: { ...foods.chicken!, cookingYieldPct: null } },
    };
    const line = generateGroceryList(noYield).lines.find((l) => l.name === 'Chicken breast')!;
    expect(line.missingYield).toBe(true);
    expect(line.rawForCookedQty).toBeNull();

    const requirement = cookingRequirements(noYield).find((r) => r.foodName === 'Chicken breast')!;
    expect(requirement.rawQty).toBeNull();
    // Still flagged as a yield-tracked food so Prep can say the yield is unset.
    expect(requirement.tracksYield).toBe(true);
  });
});
