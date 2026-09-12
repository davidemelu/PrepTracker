/**
 * Grocery generation.
 *
 * Pipeline:
 *   plan meals + day-type counts
 *     -> expand every meal once per day of that type
 *     -> resolve option groups to the preferred food
 *     -> aggregate by food, converting compatible units
 *     -> convert cooked weights to raw purchase weights
 *     -> subtract inventory where the units allow it
 *     -> estimate packages
 *
 * Every step is pure so the whole thing is unit-testable without a database.
 */

import { areUnitsCompatible, convert, findUnit, round } from './units';
import { cookedToRaw } from './yield';

export type FoodCategoryKey =
  | 'PROTEIN'
  | 'CARBOHYDRATE'
  | 'FRUIT'
  | 'VEGETABLE'
  | 'FAT'
  | 'DAIRY'
  | 'SUPPLEMENT'
  | 'SEASONING'
  | 'BEVERAGE'
  | 'OTHER';

export type IngredientStateKey = 'RAW' | 'COOKED' | 'AS_IS';

export const CATEGORY_LABELS: Record<FoodCategoryKey, string> = {
  PROTEIN: 'Protein',
  CARBOHYDRATE: 'Carbohydrates',
  FRUIT: 'Fruit',
  VEGETABLE: 'Vegetables',
  FAT: 'Fats',
  DAIRY: 'Dairy',
  SUPPLEMENT: 'Supplements',
  SEASONING: 'Seasonings',
  BEVERAGE: 'Drinks',
  OTHER: 'Other',
};

export const CATEGORY_ORDER: FoodCategoryKey[] = [
  'PROTEIN',
  'CARBOHYDRATE',
  'FRUIT',
  'VEGETABLE',
  'FAT',
  'DAIRY',
  'SEASONING',
  'SUPPLEMENT',
  'BEVERAGE',
  'OTHER',
];

export interface FoodInfo {
  id: string;
  name: string;
  category: FoodCategoryKey;
  defaultUnit: string;
  department?: string | null;
  packageSize?: number | null;
  packageUnit?: string | null;
  cookingYieldPct?: number | null;
  tracksYield: boolean;
}

export interface PlanIngredient {
  id: string;
  foodId: string | null;
  optionGroupId: string | null;
  optionGroupName?: string | null;
  unit: string;
  state: IngredientStateKey;
  required: boolean;
  /** dayTypeId -> quantity for that day type. Missing means "not eaten". */
  quantityByDayType: Readonly<Record<string, number>>;
}

export interface PlanMeal {
  id: string;
  name: string;
  /** Day type ids this meal is eaten on. */
  includedDayTypeIds: readonly string[];
  ingredients: readonly PlanIngredient[];
}

export interface DayTypeCount {
  dayTypeId: string;
  dayTypeName: string;
  days: number;
}

export interface InventoryLike {
  foodId: string | null;
  name: string;
  quantity: number;
  unit: string;
}

export interface GroceryGenerationInput {
  meals: readonly PlanMeal[];
  dayTypeCounts: readonly DayTypeCount[];
  foods: Readonly<Record<string, FoodInfo>>;
  /** optionGroupId -> chosen foodId. */
  optionPreferences?: Readonly<Record<string, string>>;
  inventory?: readonly InventoryLike[];
  /** Include ingredients marked optional. Defaults to true. */
  includeOptional?: boolean;
}

export interface GrocerySource {
  mealName: string;
  quantityPerDay: number;
  unit: string;
  days: number;
  dayTypeName: string;
}

export interface GroceryLine {
  /** Stable aggregation key: food id when known, else a normalised name. */
  key: string;
  foodId: string | null;
  name: string;
  category: FoodCategoryKey;
  department: string | null;

  /** What the plan needs, in the plan's own terms (cooked, for meat and rice). */
  requiredQty: number;
  requiredUnit: string;

  /** Cooked/raw split, only populated for foods that track a cooking yield. */
  cookedQty: number | null;
  /**
   * Total raw weight to buy: the cooked requirement converted, plus anything of
   * the same food the plan already asks for by raw or as-purchased weight.
   */
  rawQty: number | null;
  /**
   * Raw weight that yields `cookedQty` alone. This is what Prep Day needs —
   * how much to put in the pan for the batch — and it is smaller than `rawQty`
   * whenever the same food also appears somewhere in a raw or as-is amount.
   */
  rawForCookedQty: number | null;
  yieldPctUsed: number | null;
  /** True when a cooked requirement could not be converted for want of a yield. */
  missingYield: boolean;

  /** What to actually buy, after yield conversion and inventory subtraction. */
  shoppingQty: number;
  shoppingUnit: string;

  inventoryQty: number | null;
  inventoryNote: string | null;

  packageSize: number | null;
  packageUnit: string | null;
  estimatedPackages: number | null;

  sources: GrocerySource[];
}

export interface GroceryGenerationResult {
  lines: GroceryLine[];
  warnings: string[];
  totalDays: number;
}

interface Accumulator {
  key: string;
  foodId: string | null;
  name: string;
  category: FoodCategoryKey;
  department: string | null;
  food: FoodInfo | null;
  /** Base-unit totals split by state so cooked weights can be converted. */
  baseByState: Map<IngredientStateKey, number>;
  baseUnit: string | null;
  /** Unit to report in, chosen from the food default or the first unit seen. */
  displayUnit: string;
  incompatibleUnits: Set<string>;
  sources: GrocerySource[];
}

function normaliseKey(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve an ingredient to the food that will actually be bought.
 * Preference order: explicit week preference -> group default -> fixed food.
 */
export function resolveIngredientFood(
  ingredient: PlanIngredient,
  optionPreferences: Readonly<Record<string, string>> = {},
): string | null {
  if (ingredient.optionGroupId) {
    const chosen = optionPreferences[ingredient.optionGroupId];
    if (chosen) return chosen;
  }
  return ingredient.foodId;
}

/**
 * Expand the plan into per-food totals and aggregate them.
 *
 * Worked example with the default plan, 5 training + 2 rest days:
 *   Meal 2 rice: 225 g x 5 + 175 g x 2 = 1475 g cooked
 *   Meal 4 rice: 225 g x 5 + 175 g x 2 = 1475 g cooked
 *   Meal 5 rice: 150 g x 5 +   0 g x 2 =  750 g cooked
 *   Aggregated: 3700 g cooked rice -> at a 300% yield, 1233.3 g dry rice.
 */
export function generateGroceryList(input: GroceryGenerationInput): GroceryGenerationResult {
  const includeOptional = input.includeOptional ?? true;
  const optionPreferences = input.optionPreferences ?? {};
  const warnings: string[] = [];
  const accumulators = new Map<string, Accumulator>();

  const totalDays = input.dayTypeCounts.reduce((sum, d) => sum + Math.max(0, d.days), 0);

  for (const meal of input.meals) {
    for (const dayType of input.dayTypeCounts) {
      const days = Math.max(0, Math.floor(dayType.days));
      if (days === 0) continue;
      if (!meal.includedDayTypeIds.includes(dayType.dayTypeId)) continue;

      for (const ingredient of meal.ingredients) {
        if (!includeOptional && !ingredient.required) continue;

        const perDay = ingredient.quantityByDayType[dayType.dayTypeId] ?? 0;
        if (!Number.isFinite(perDay) || perDay <= 0) continue;

        const foodId = resolveIngredientFood(ingredient, optionPreferences);
        const food = foodId ? (input.foods[foodId] ?? null) : null;

        if (foodId && !food) {
          warnings.push(
            `${meal.name}: an ingredient refers to a food that no longer exists and was skipped.`,
          );
          continue;
        }
        if (!food) {
          warnings.push(
            `${meal.name}: "${ingredient.optionGroupName ?? 'an ingredient'}" has no food selected, so it was left off the list.`,
          );
          continue;
        }

        const key = food.id ? `food:${food.id}` : `name:${normaliseKey(food.name)}`;
        let acc = accumulators.get(key);
        if (!acc) {
          acc = {
            key,
            foodId: food.id,
            name: food.name,
            category: food.category,
            department: food.department ?? null,
            food,
            baseByState: new Map(),
            baseUnit: null,
            displayUnit: food.defaultUnit || ingredient.unit,
            incompatibleUnits: new Set(),
            sources: [],
          };
          accumulators.set(key, acc);
        }

        // Aggregate in base units so g/kg and ml/L mix safely.
        const unitDef = findUnit(ingredient.unit);
        const total = perDay * days;

        if (!unitDef) {
          acc.incompatibleUnits.add(ingredient.unit);
          warnings.push(
            `${food.name}: unit "${ingredient.unit}" is not a known unit, so it could not be added up.`,
          );
          continue;
        }

        const baseUnit = unitDef.dimension;
        if (acc.baseUnit && acc.baseUnit !== baseUnit) {
          acc.incompatibleUnits.add(ingredient.unit);
          warnings.push(
            `${food.name} is measured in both ${acc.baseUnit.toLowerCase()} and ${baseUnit.toLowerCase()} units; only the ${acc.baseUnit.toLowerCase()} amounts were combined.`,
          );
          continue;
        }
        acc.baseUnit = baseUnit;

        // Keep the display unit compatible with what we are summing.
        if (!areUnitsCompatible(acc.displayUnit, ingredient.unit)) {
          acc.displayUnit = ingredient.unit;
        }

        const inBase = total * unitDef.toBase;
        acc.baseByState.set(ingredient.state, (acc.baseByState.get(ingredient.state) ?? 0) + inBase);

        acc.sources.push({
          mealName: meal.name,
          quantityPerDay: perDay,
          unit: ingredient.unit,
          days,
          dayTypeName: dayType.dayTypeName,
        });
      }
    }
  }

  const lines: GroceryLine[] = [];

  for (const acc of accumulators.values()) {
    const food = acc.food!;
    const displayUnit = acc.displayUnit;

    const toDisplay = (base: number): number => {
      const def = findUnit(displayUnit);
      return def ? base / def.toBase : base;
    };

    const cookedBase = acc.baseByState.get('COOKED') ?? 0;
    const rawBase = acc.baseByState.get('RAW') ?? 0;
    const asIsBase = acc.baseByState.get('AS_IS') ?? 0;
    const requiredBase = cookedBase + rawBase + asIsBase;

    const tracksYield = food.tracksYield && cookedBase > 0;
    const yieldPct = food.cookingYieldPct ?? null;
    const usableYield = tracksYield && yieldPct != null && yieldPct > 0;

    let shoppingBase: number;
    // The raw weight that produces the cooked requirement, and nothing else.
    // Distinct from `shoppingBase`, which also carries any raw and as-is
    // amounts of the same food: those are already purchase weights and must not
    // reach the cook, who is being told how much to start with for one batch.
    let rawForCookedBase: number | null = null;
    let missingYield = false;

    if (tracksYield && usableYield) {
      // Convert only the cooked portion; raw and as-is amounts are already
      // purchase weights.
      rawForCookedBase = cookedToRaw(cookedBase, yieldPct!);
      shoppingBase = rawForCookedBase + rawBase + asIsBase;
    } else if (tracksYield) {
      shoppingBase = requiredBase;
      missingYield = true;
      warnings.push(
        `${food.name} is planned in cooked weight but has no cooking yield set, so the shopping amount is the cooked weight. Set a yield under Prep → Yields.`,
      );
    } else {
      shoppingBase = requiredBase;
    }

    const line: GroceryLine = {
      key: acc.key,
      foodId: acc.foodId,
      name: acc.name,
      category: acc.category,
      department: acc.department,
      requiredQty: round(toDisplay(requiredBase), 2),
      requiredUnit: displayUnit,
      cookedQty: cookedBase > 0 ? round(toDisplay(cookedBase), 2) : null,
      rawQty: tracksYield ? round(toDisplay(shoppingBase), 2) : null,
      rawForCookedQty: rawForCookedBase === null ? null : round(toDisplay(rawForCookedBase), 2),
      yieldPctUsed: usableYield ? round(yieldPct!, 2) : null,
      missingYield,
      shoppingQty: round(toDisplay(shoppingBase), 2),
      shoppingUnit: displayUnit,
      inventoryQty: null,
      inventoryNote: null,
      packageSize: food.packageSize ?? null,
      packageUnit: food.packageUnit ?? null,
      estimatedPackages: null,
      sources: acc.sources,
    };

    lines.push(line);
  }

  const withInventory = input.inventory?.length
    ? applyInventory(lines, input.inventory)
    : { lines, warnings: [] as string[] };

  const finalLines = withInventory.lines.map(estimatePackages);
  warnings.push(...withInventory.warnings);

  finalLines.sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    if (ca !== cb) return ca - cb;
    return a.name.localeCompare(b.name);
  });

  return { lines: finalLines, warnings: [...new Set(warnings)], totalDays };
}

/**
 * Subtract what is already in the pantry.
 *
 * Only subtracts when the inventory row is linked to the same food *and* the
 * units convert. Anything else is reported as a note, because a wrong
 * subtraction means arriving home without dinner.
 */
export function applyInventory(
  lines: readonly GroceryLine[],
  inventory: readonly InventoryLike[],
): { lines: GroceryLine[]; warnings: string[] } {
  const warnings: string[] = [];

  const byFood = new Map<string, InventoryLike[]>();
  for (const item of inventory) {
    if (!item.foodId) continue;
    const list = byFood.get(item.foodId) ?? [];
    list.push(item);
    byFood.set(item.foodId, list);
  }

  const out = lines.map((line) => {
    if (!line.foodId) return line;
    const items = byFood.get(line.foodId);
    if (!items || items.length === 0) return line;

    let available = 0;
    const unconvertible: string[] = [];

    for (const item of items) {
      if (item.quantity <= 0) continue;
      const converted = convert(item.quantity, item.unit, line.shoppingUnit);
      if (converted === null) unconvertible.push(`${item.quantity} ${item.unit}`);
      else available += converted;
    }

    const inventoryNote =
      unconvertible.length > 0
        ? `You also have ${unconvertible.join(', ')} recorded, which could not be converted to ${line.shoppingUnit}. Check before buying.`
        : null;

    if (inventoryNote) warnings.push(`${line.name}: ${inventoryNote}`);
    if (available <= 0) return { ...line, inventoryNote };

    return {
      ...line,
      inventoryQty: round(available, 2),
      inventoryNote,
      shoppingQty: round(Math.max(0, line.shoppingQty - available), 2),
    };
  });

  return { lines: out, warnings };
}

/**
 * Whole packages to buy. Omitted entirely when the food has no package size,
 * rather than guessing one.
 */
export function estimatePackages(line: GroceryLine): GroceryLine {
  // Always assigns the field, so a line can never keep a stale estimate from
  // before its shopping quantity changed.
  if (!line.packageSize || line.packageSize <= 0 || !line.packageUnit) {
    return { ...line, estimatedPackages: null };
  }
  const converted = convert(line.shoppingQty, line.shoppingUnit, line.packageUnit);
  if (converted === null) return { ...line, estimatedPackages: null };
  if (converted <= 0) return { ...line, estimatedPackages: 0 };
  return { ...line, estimatedPackages: Math.ceil(round(converted / line.packageSize, 4)) };
}

/** Group lines for the category view. Empty categories are dropped. */
export function groupByCategory(
  lines: readonly GroceryLine[],
): Array<{ category: FoodCategoryKey; label: string; lines: GroceryLine[] }> {
  const groups = new Map<FoodCategoryKey, GroceryLine[]>();
  for (const line of lines) {
    const list = groups.get(line.category) ?? [];
    list.push(line);
    groups.set(line.category, list);
  }
  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((category) => ({
    category,
    label: CATEGORY_LABELS[category],
    lines: groups.get(category)!,
  }));
}

/** Group lines by store department for Shopping Mode. */
export function groupByDepartment<T extends { department: string | null; category: FoodCategoryKey }>(
  lines: readonly T[],
): Array<{ department: string; lines: T[] }> {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const key = line.department?.trim() || CATEGORY_LABELS[line.category];
    const list = groups.get(key) ?? [];
    list.push(line);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .map(([department, items]) => ({ department, lines: items }))
    .sort((a, b) => a.department.localeCompare(b.department));
}

export interface SupplementNeed {
  supplementId: string;
  name: string;
  /** Doses taken per applicable day. */
  countPerDose: number;
  form: string;
  dosageAmount: number | null;
  dosageUnit: string | null;
  /** 'EVERY_DAY' | 'TRAINING_ONLY' | 'REST_ONLY' */
  applicability: string;
  /** Matching food row, when one exists, so packages can be estimated. */
  food?: FoodInfo | null;
}

/**
 * How much of each supplement a planning period needs.
 *
 * Expressed in the dosage unit when that is a real mass unit (creatine in
 * grams), otherwise in counts of tablets, capsules or scoops.
 */
export function supplementGroceryLines(
  supplements: readonly SupplementNeed[],
  trainingDays: number,
  restDays: number,
): GroceryLine[] {
  const lines: GroceryLine[] = [];

  for (const supplement of supplements) {
    const days =
      supplement.applicability === 'TRAINING_ONLY'
        ? trainingDays
        : supplement.applicability === 'REST_ONLY'
          ? restDays
          : trainingDays + restDays;

    if (days <= 0) continue;

    // Prefer the dosage unit when it is a unit the app can aggregate.
    const dosageUnitDef = supplement.dosageUnit ? findUnit(supplement.dosageUnit) : undefined;
    const useDosage = Boolean(dosageUnitDef && supplement.dosageAmount);

    const quantity = useDosage
      ? supplement.dosageAmount! * supplement.countPerDose * days
      : supplement.countPerDose * days;
    const unit = useDosage ? dosageUnitDef!.key : supplement.form.toLowerCase();

    const food = supplement.food ?? null;

    lines.push(
      estimatePackages({
        key: `supplement:${supplement.supplementId}`,
        foodId: food?.id ?? null,
        name: supplement.name,
        category: 'SUPPLEMENT',
        department: food?.department ?? 'Supplements',
        requiredQty: round(quantity, 2),
        requiredUnit: unit,
        cookedQty: null,
        rawQty: null,
        rawForCookedQty: null,
        yieldPctUsed: null,
        missingYield: false,
        shoppingQty: round(quantity, 2),
        shoppingUnit: unit,
        inventoryQty: null,
        inventoryNote: null,
        packageSize: food?.packageSize ?? null,
        packageUnit: food?.packageUnit ?? null,
        estimatedPackages: null,
        sources: [
          {
            mealName: 'Supplements',
            quantityPerDay: round(useDosage ? supplement.dosageAmount! * supplement.countPerDose : supplement.countPerDose, 2),
            unit,
            days,
            dayTypeName:
              supplement.applicability === 'TRAINING_ONLY'
                ? 'Training'
                : supplement.applicability === 'REST_ONLY'
                  ? 'Rest'
                  : 'All days',
          },
        ],
      }),
    );
  }

  return lines;
}

/**
 * Cooked-weight requirements per food, used by Prep Day to say how much to cook.
 * Reuses the same expansion as the grocery list so the two can never disagree.
 */
export interface CookRequirement {
  foodId: string;
  foodName: string;
  cookedQty: number;
  unit: string;
  /** Raw weight for this cooked amount alone — what to start the batch with. */
  rawQty: number | null;
  yieldPct: number | null;
  tracksYield: boolean;
}

export function cookingRequirements(input: GroceryGenerationInput): CookRequirement[] {
  const { lines } = generateGroceryList({ ...input, inventory: [] });
  return lines
    .filter((line) => line.cookedQty != null && line.cookedQty > 0 && line.foodId)
    .map((line) => ({
      foodId: line.foodId!,
      foodName: line.name,
      cookedQty: line.cookedQty!,
      unit: line.requiredUnit,
      // The raw weight for the cooked requirement only. `line.rawQty` is the
      // shopping total and would over-state the batch whenever the same food is
      // also planned raw somewhere.
      rawQty: line.rawForCookedQty,
      yieldPct: line.yieldPctUsed,
      tracksYield: line.rawForCookedQty != null || line.missingYield,
    }));
}

export interface ShoppingProgress {
  total: number;
  done: number;
  remaining: number;
  /** Whole percent, for a bar and for "63% bought". */
  percent: number;
}

/**
 * How far through a shopping list you are.
 *
 * An item counts as done when it is in the trolley or was already in the
 * cupboard, which is the same question from the shopper's point of view. Two
 * screens ask it, and an empty list is 0% rather than 100% so a list that has
 * not been generated yet does not read as finished.
 */
export function shoppingProgress(
  items: readonly { purchased: boolean; haveAlready: boolean }[],
): ShoppingProgress {
  const total = items.length;
  const done = items.filter((item) => item.purchased || item.haveAlready).length;
  return {
    total,
    done,
    remaining: total - done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}
