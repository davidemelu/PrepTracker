/**
 * Seed data.
 *
 * This file writes *rows*, not behaviour. Every value below — meals,
 * quantities, times, yields, supplements, water target, bulk classifications —
 * is editable in the app afterwards, and the application never reads this file
 * at runtime.
 *
 * Safe to re-run: foods, day types and supplements are upserted by their unique
 * keys, and the meal plan is only created when the user has no plan yet, so a
 * second run can never clobber edits you have made.
 */

import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  BulkClass,
  DayApplicability,
  FoodCategory,
  IngredientState,
  PrismaClient,
  StorageLocation,
  SupplementForm,
  SupplementTiming,
  WorkoutFocusCategory,
  YieldSource,
} from '../src/generated/prisma';
import { hashPassword } from '../src/lib/auth/password';

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(process.cwd(), file));
  } catch {
    /* environment may be supplied directly */
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is not set.');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// ---------------------------------------------------------------------------
// Foods
// ---------------------------------------------------------------------------

interface SeedFood {
  name: string;
  category: FoodCategory;
  defaultUnit: string;
  department: string;
  bulkClass: BulkClass;
  storageDefault: StorageLocation;
  packageSize?: number;
  packageUnit?: string;
  cookingYieldPct?: number;
  tracksYield?: boolean;
  /** Nutrition is per `basisQty` of `basisUnit` and is an editable estimate. */
  basisQty?: number;
  basisUnit?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fibre?: number;
  sodium?: number;
  notes?: string;
}

const FOODS: SeedFood[] = [
  // --- Protein -------------------------------------------------------------
  {
    name: 'Eggs',
    category: FoodCategory.PROTEIN,
    defaultUnit: 'each',
    department: 'Dairy & Eggs',
    bulkClass: BulkClass.BUY_FRESH,
    storageDefault: StorageLocation.FRIDGE,
    packageSize: 12,
    packageUnit: 'each',
    basisQty: 1,
    basisUnit: 'each',
    calories: 72,
    protein: 6.3,
    carbs: 0.4,
    fat: 4.8,
    sodium: 71,
  },
  {
    name: 'Egg whites',
    category: FoodCategory.PROTEIN,
    defaultUnit: 'g',
    department: 'Dairy & Eggs',
    bulkClass: BulkClass.BUY_FRESH,
    storageDefault: StorageLocation.FRIDGE,
    packageSize: 500,
    packageUnit: 'g',
    calories: 52,
    protein: 10.9,
    carbs: 0.7,
    fat: 0.2,
    sodium: 166,
  },
  {
    name: 'Chicken breast',
    category: FoodCategory.PROTEIN,
    defaultUnit: 'g',
    department: 'Meat & Seafood',
    bulkClass: BulkClass.GOOD_IF_FROZEN,
    storageDefault: StorageLocation.FREEZER,
    packageSize: 1000,
    packageUnit: 'g',
    cookingYieldPct: 75,
    tracksYield: true,
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    sodium: 74,
    notes: 'Plan quantities are cooked weight. Yield converts them to raw for shopping.',
  },
  {
    name: 'Ground turkey',
    category: FoodCategory.PROTEIN,
    defaultUnit: 'g',
    department: 'Meat & Seafood',
    bulkClass: BulkClass.GOOD_IF_FROZEN,
    storageDefault: StorageLocation.FREEZER,
    packageSize: 500,
    packageUnit: 'g',
    cookingYieldPct: 78,
    tracksYield: true,
    calories: 176,
    protein: 27,
    carbs: 0,
    fat: 7.4,
    sodium: 78,
  },
  {
    name: 'Steak',
    category: FoodCategory.PROTEIN,
    defaultUnit: 'g',
    department: 'Meat & Seafood',
    bulkClass: BulkClass.GOOD_IF_FROZEN,
    storageDefault: StorageLocation.FREEZER,
    packageSize: 500,
    packageUnit: 'g',
    cookingYieldPct: 75,
    tracksYield: true,
    calories: 212,
    protein: 30,
    carbs: 0,
    fat: 9.6,
    sodium: 58,
  },
  {
    name: 'Extra lean ground beef',
    category: FoodCategory.PROTEIN,
    defaultUnit: 'g',
    department: 'Meat & Seafood',
    bulkClass: BulkClass.GOOD_IF_FROZEN,
    storageDefault: StorageLocation.FREEZER,
    packageSize: 500,
    packageUnit: 'g',
    cookingYieldPct: 78,
    tracksYield: true,
    calories: 214,
    protein: 27,
    carbs: 0,
    fat: 11,
    sodium: 66,
  },
  {
    name: 'Salmon',
    category: FoodCategory.PROTEIN,
    defaultUnit: 'g',
    department: 'Meat & Seafood',
    bulkClass: BulkClass.GOOD_IF_FROZEN,
    storageDefault: StorageLocation.FREEZER,
    packageSize: 400,
    packageUnit: 'g',
    cookingYieldPct: 80,
    tracksYield: true,
    calories: 206,
    protein: 22,
    carbs: 0,
    fat: 12,
    sodium: 61,
  },
  {
    name: 'IsoWhey',
    category: FoodCategory.PROTEIN,
    defaultUnit: 'g',
    department: 'Supplements',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 2000,
    packageUnit: 'g',
    calories: 380,
    protein: 80,
    carbs: 6,
    fat: 3,
    sodium: 250,
  },

  // --- Carbohydrate --------------------------------------------------------
  {
    name: 'Bagels',
    category: FoodCategory.CARBOHYDRATE,
    defaultUnit: 'each',
    department: 'Bakery',
    bulkClass: BulkClass.GOOD_IF_FROZEN,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 6,
    packageUnit: 'each',
    basisQty: 1,
    basisUnit: 'each',
    calories: 245,
    protein: 10,
    carbs: 48,
    fat: 1.5,
    fibre: 2,
    sodium: 430,
  },
  {
    name: 'White rice',
    category: FoodCategory.CARBOHYDRATE,
    defaultUnit: 'g',
    department: 'Dry Goods',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 5000,
    packageUnit: 'g',
    // Rice gains weight when cooked: 100 g dry yields roughly 300 g cooked, so
    // the same cooked -> raw formula gives the dry amount to buy.
    cookingYieldPct: 300,
    tracksYield: true,
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fat: 0.3,
    fibre: 0.4,
    sodium: 1,
    notes: 'Plan quantities are cooked weight. The 300% yield converts them to dry rice for shopping.',
  },
  {
    name: 'Oats',
    category: FoodCategory.CARBOHYDRATE,
    defaultUnit: 'g',
    department: 'Dry Goods',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 1000,
    packageUnit: 'g',
    calories: 389,
    protein: 16.9,
    carbs: 66,
    fat: 6.9,
    fibre: 10.6,
    sodium: 2,
  },

  // --- Fruit ---------------------------------------------------------------
  {
    name: 'Orange',
    category: FoodCategory.FRUIT,
    defaultUnit: 'each',
    department: 'Produce',
    bulkClass: BulkClass.BUY_FRESH,
    storageDefault: StorageLocation.FRIDGE,
    basisQty: 1,
    basisUnit: 'each',
    calories: 62,
    protein: 1.2,
    carbs: 15.4,
    fat: 0.2,
    fibre: 3.1,
  },
  {
    name: 'Frozen berries',
    category: FoodCategory.FRUIT,
    defaultUnit: 'g',
    department: 'Frozen',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.FREEZER,
    packageSize: 500,
    packageUnit: 'g',
    calories: 50,
    protein: 0.7,
    carbs: 12,
    fat: 0.3,
    fibre: 3,
  },
  {
    name: 'Banana',
    category: FoodCategory.FRUIT,
    defaultUnit: 'g',
    department: 'Produce',
    bulkClass: BulkClass.BUY_FRESH,
    storageDefault: StorageLocation.PANTRY,
    calories: 89,
    protein: 1.1,
    carbs: 23,
    fat: 0.3,
    fibre: 2.6,
    notes: 'Measured by weight so it can be swapped with frozen berries in the same meal.',
  },

  // --- Vegetables ----------------------------------------------------------
  {
    name: 'Frozen mixed vegetables',
    category: FoodCategory.VEGETABLE,
    defaultUnit: 'g',
    department: 'Frozen',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.FREEZER,
    packageSize: 1000,
    packageUnit: 'g',
    calories: 65,
    protein: 2.6,
    carbs: 13,
    fat: 0.4,
    fibre: 4,
    sodium: 30,
  },

  // --- Fats ----------------------------------------------------------------
  {
    name: 'Avocado',
    category: FoodCategory.FAT,
    defaultUnit: 'each',
    department: 'Produce',
    bulkClass: BulkClass.BUY_FRESH,
    storageDefault: StorageLocation.FRIDGE,
    basisQty: 1,
    basisUnit: 'each',
    calories: 240,
    protein: 3,
    carbs: 12.8,
    fat: 22,
    fibre: 10,
  },
  {
    name: 'Peanut butter',
    category: FoodCategory.FAT,
    defaultUnit: 'g',
    department: 'Dry Goods',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 500,
    packageUnit: 'g',
    calories: 588,
    protein: 25,
    carbs: 20,
    fat: 50,
    fibre: 6,
    sodium: 17,
  },
  {
    name: 'Almond butter',
    category: FoodCategory.FAT,
    defaultUnit: 'g',
    department: 'Dry Goods',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 500,
    packageUnit: 'g',
    calories: 614,
    protein: 21,
    carbs: 19,
    fat: 56,
    fibre: 10,
    sodium: 7,
  },

  // --- Seasonings ----------------------------------------------------------
  {
    name: 'Pink Himalayan salt',
    category: FoodCategory.SEASONING,
    defaultUnit: 'tsp',
    department: 'Dry Goods',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    basisQty: 1,
    basisUnit: 'tsp',
    sodium: 2300,
  },

  // --- Supplement products (for inventory, bulk buying and grocery lines) ---
  {
    name: 'Multivitamin',
    category: FoodCategory.SUPPLEMENT,
    defaultUnit: 'tablet',
    department: 'Supplements',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 90,
    packageUnit: 'tablet',
  },
  {
    name: 'Omega 3',
    category: FoodCategory.SUPPLEMENT,
    defaultUnit: 'capsule',
    department: 'Supplements',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 120,
    packageUnit: 'capsule',
  },
  {
    name: 'Vitamin D',
    category: FoodCategory.SUPPLEMENT,
    defaultUnit: 'capsule',
    department: 'Supplements',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 120,
    packageUnit: 'capsule',
  },
  {
    name: 'Vitamin C',
    category: FoodCategory.SUPPLEMENT,
    defaultUnit: 'tablet',
    department: 'Supplements',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 100,
    packageUnit: 'tablet',
  },
  {
    name: 'Turmeric with black pepper',
    category: FoodCategory.SUPPLEMENT,
    defaultUnit: 'capsule',
    department: 'Supplements',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 90,
    packageUnit: 'capsule',
  },
  {
    name: 'Berberine',
    category: FoodCategory.SUPPLEMENT,
    defaultUnit: 'capsule',
    department: 'Supplements',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 60,
    packageUnit: 'capsule',
  },
  {
    name: 'Creatine monohydrate',
    category: FoodCategory.SUPPLEMENT,
    defaultUnit: 'g',
    department: 'Supplements',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 500,
    packageUnit: 'g',
  },
  {
    name: 'Magnesium bisglycinate',
    category: FoodCategory.SUPPLEMENT,
    defaultUnit: 'capsule',
    department: 'Supplements',
    bulkClass: BulkClass.EXCELLENT,
    storageDefault: StorageLocation.PANTRY,
    packageSize: 120,
    packageUnit: 'capsule',
  },
];

// ---------------------------------------------------------------------------
// Meal plan
// ---------------------------------------------------------------------------

type Qty = { training: number; rest: number };

interface SeedIngredient {
  food?: string;
  optionGroup?: string;
  unit: string;
  state: IngredientState;
  qty: Qty;
  required?: boolean;
  notes?: string;
}

interface SeedMeal {
  name: string;
  description?: string;
  defaultTime: string;
  windowMinutes?: number;
  isPreWorkout?: boolean;
  isPostWorkout?: boolean;
  ingredients: SeedIngredient[];
}

const SALT: SeedIngredient = {
  food: 'Pink Himalayan salt',
  unit: 'tsp',
  state: IngredientState.AS_IS,
  qty: { training: 0.25, rest: 0.25 },
  required: false,
  notes: 'Seasoning with each meal.',
};

const OPTION_GROUPS: Array<{ name: string; members: string[]; preferred: string; notes?: string }> = [
  {
    name: 'Meal 2 & 4 protein',
    members: ['Chicken breast', 'Ground turkey'],
    preferred: 'Chicken breast',
    notes: 'Shared by meals 2 and 4 so a swap applies to both and groceries aggregate to one line.',
  },
  {
    name: 'Meal 5 protein',
    members: ['Steak', 'Extra lean ground beef', 'Salmon'],
    preferred: 'Steak',
  },
  {
    name: 'Fruit option',
    members: ['Frozen berries', 'Banana'],
    preferred: 'Frozen berries',
  },
  {
    name: 'Nut butter',
    members: ['Peanut butter', 'Almond butter'],
    preferred: 'Peanut butter',
  },
];

const MEALS: SeedMeal[] = [
  {
    name: 'Meal 1',
    defaultTime: '08:00',
    ingredients: [
      { food: 'Eggs', unit: 'each', state: IngredientState.AS_IS, qty: { training: 2, rest: 2 } },
      { food: 'Egg whites', unit: 'g', state: IngredientState.AS_IS, qty: { training: 200, rest: 200 } },
      { food: 'Bagels', unit: 'each', state: IngredientState.AS_IS, qty: { training: 2, rest: 1 } },
      { food: 'Avocado', unit: 'each', state: IngredientState.AS_IS, qty: { training: 0.5, rest: 0.5 } },
      SALT,
    ],
  },
  {
    name: 'Meal 2',
    defaultTime: '13:15',
    ingredients: [
      { food: 'White rice', unit: 'g', state: IngredientState.COOKED, qty: { training: 225, rest: 175 } },
      { optionGroup: 'Meal 2 & 4 protein', unit: 'g', state: IngredientState.COOKED, qty: { training: 175, rest: 175 } },
      { food: 'Frozen mixed vegetables', unit: 'g', state: IngredientState.COOKED, qty: { training: 100, rest: 100 } },
      { food: 'Orange', unit: 'each', state: IngredientState.AS_IS, qty: { training: 1, rest: 1 } },
      SALT,
    ],
  },
  {
    name: 'Meal 3',
    description: 'Pre-workout',
    defaultTime: '18:30',
    windowMinutes: 30,
    isPreWorkout: true,
    ingredients: [
      { food: 'Oats', unit: 'g', state: IngredientState.AS_IS, qty: { training: 70, rest: 55 } },
      { food: 'IsoWhey', unit: 'g', state: IngredientState.AS_IS, qty: { training: 50, rest: 50 } },
      { optionGroup: 'Fruit option', unit: 'g', state: IngredientState.AS_IS, qty: { training: 100, rest: 100 } },
      { optionGroup: 'Nut butter', unit: 'g', state: IngredientState.AS_IS, qty: { training: 16, rest: 16 } },
      SALT,
    ],
  },
  {
    name: 'Meal 4',
    defaultTime: '21:00',
    isPostWorkout: true,
    ingredients: [
      { food: 'White rice', unit: 'g', state: IngredientState.COOKED, qty: { training: 225, rest: 175 } },
      { optionGroup: 'Meal 2 & 4 protein', unit: 'g', state: IngredientState.COOKED, qty: { training: 175, rest: 175 } },
      { food: 'Frozen mixed vegetables', unit: 'g', state: IngredientState.COOKED, qty: { training: 100, rest: 100 } },
      SALT,
    ],
  },
  {
    name: 'Meal 5',
    defaultTime: '23:00',
    ingredients: [
      {
        food: 'White rice',
        unit: 'g',
        state: IngredientState.COOKED,
        qty: { training: 150, rest: 0 },
        notes: 'No rice on rest days. The line stays in the plan so training days are unaffected.',
      },
      { optionGroup: 'Meal 5 protein', unit: 'g', state: IngredientState.COOKED, qty: { training: 175, rest: 175 } },
      { food: 'Frozen mixed vegetables', unit: 'g', state: IngredientState.COOKED, qty: { training: 100, rest: 100 } },
      SALT,
    ],
  },
];

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------

interface SeedSupplement {
  name: string;
  dosageAmount?: number;
  dosageUnit?: string;
  countPerDose: number;
  form: SupplementForm;
  timing: SupplementTiming;
  applicability: DayApplicability;
  mealName?: string;
  notes?: string;
}

const SUPPLEMENTS: SeedSupplement[] = [
  { name: 'Multivitamin', countPerDose: 1, form: SupplementForm.TABLET, timing: SupplementTiming.AM, applicability: DayApplicability.EVERY_DAY },
  { name: 'Omega 3', countPerDose: 1, form: SupplementForm.SOFTGEL, timing: SupplementTiming.AM, applicability: DayApplicability.EVERY_DAY },
  {
    name: 'Vitamin D',
    dosageAmount: 3000,
    dosageUnit: 'IU',
    countPerDose: 1,
    form: SupplementForm.SOFTGEL,
    timing: SupplementTiming.AM,
    applicability: DayApplicability.EVERY_DAY,
  },
  {
    name: 'Vitamin C',
    dosageAmount: 1000,
    dosageUnit: 'mg',
    countPerDose: 1,
    form: SupplementForm.TABLET,
    timing: SupplementTiming.AM,
    applicability: DayApplicability.EVERY_DAY,
  },
  {
    name: 'Turmeric with black pepper',
    dosageAmount: 500,
    dosageUnit: 'mg',
    countPerDose: 1,
    form: SupplementForm.CAPSULE,
    timing: SupplementTiming.AM,
    applicability: DayApplicability.EVERY_DAY,
  },
  {
    name: 'Berberine',
    dosageAmount: 500,
    dosageUnit: 'mg',
    countPerDose: 1,
    form: SupplementForm.CAPSULE,
    timing: SupplementTiming.AFTER_BREAKFAST,
    applicability: DayApplicability.EVERY_DAY,
    mealName: 'Meal 1',
  },
  {
    name: 'Creatine monohydrate',
    dosageAmount: 5,
    dosageUnit: 'g',
    countPerDose: 1,
    form: SupplementForm.SCOOP,
    timing: SupplementTiming.PRE_WORKOUT,
    applicability: DayApplicability.EVERY_DAY,
    notes: 'Taken every day; on training days it lines up with the pre-workout meal.',
  },
  {
    name: 'Magnesium bisglycinate',
    dosageAmount: 500,
    dosageUnit: 'mg',
    countPerDose: 1,
    form: SupplementForm.CAPSULE,
    timing: SupplementTiming.BEFORE_BED,
    applicability: DayApplicability.EVERY_DAY,
  },
];

/**
 * The starting workout catalogue. Every one of these is an ordinary row you can
 * rename, reorder, deactivate or delete, and you can add your own.
 */
const LEG_PRE_WORKOUT_MINUTES = 90;

const WORKOUT_FOCUSES: Array<{
  name: string;
  category: WorkoutFocusCategory;
  /** Overrides how long before training to eat when this focus is trained. */
  preWorkoutMinutes?: number;
}> = [
  { name: 'Chest', category: WorkoutFocusCategory.MUSCLE_GROUP },
  { name: 'Back', category: WorkoutFocusCategory.MUSCLE_GROUP },
  { name: 'Shoulders', category: WorkoutFocusCategory.MUSCLE_GROUP },
  { name: 'Biceps', category: WorkoutFocusCategory.MUSCLE_GROUP },
  { name: 'Triceps', category: WorkoutFocusCategory.MUSCLE_GROUP },
  { name: 'Legs', category: WorkoutFocusCategory.MUSCLE_GROUP, preWorkoutMinutes: LEG_PRE_WORKOUT_MINUTES },
  { name: 'Quads', category: WorkoutFocusCategory.MUSCLE_GROUP, preWorkoutMinutes: LEG_PRE_WORKOUT_MINUTES },
  { name: 'Hamstrings', category: WorkoutFocusCategory.MUSCLE_GROUP, preWorkoutMinutes: LEG_PRE_WORKOUT_MINUTES },
  { name: 'Glutes', category: WorkoutFocusCategory.MUSCLE_GROUP, preWorkoutMinutes: LEG_PRE_WORKOUT_MINUTES },
  { name: 'Calves', category: WorkoutFocusCategory.MUSCLE_GROUP, preWorkoutMinutes: LEG_PRE_WORKOUT_MINUTES },
  { name: 'Abs/Core', category: WorkoutFocusCategory.MUSCLE_GROUP },
  { name: 'Push', category: WorkoutFocusCategory.SPLIT },
  { name: 'Pull', category: WorkoutFocusCategory.SPLIT },
  { name: 'Upper', category: WorkoutFocusCategory.SPLIT },
  { name: 'Lower', category: WorkoutFocusCategory.SPLIT, preWorkoutMinutes: LEG_PRE_WORKOUT_MINUTES },
  { name: 'Full Body', category: WorkoutFocusCategory.SPLIT },
  { name: 'Cardio', category: WorkoutFocusCategory.CONDITIONING },
  { name: 'Conditioning', category: WorkoutFocusCategory.CONDITIONING },
  { name: 'Mobility', category: WorkoutFocusCategory.CONDITIONING },
];

/** Items worth having a stock level for, seeded empty for you to fill in. */
const INVENTORY_SEEDS: Array<{ food: string; unit: string; location: StorageLocation; threshold: number }> = [
  { food: 'White rice', unit: 'g', location: StorageLocation.PANTRY, threshold: 1000 },
  { food: 'Oats', unit: 'g', location: StorageLocation.PANTRY, threshold: 500 },
  { food: 'IsoWhey', unit: 'g', location: StorageLocation.PANTRY, threshold: 500 },
  { food: 'Peanut butter', unit: 'g', location: StorageLocation.PANTRY, threshold: 150 },
  { food: 'Frozen berries', unit: 'g', location: StorageLocation.FREEZER, threshold: 500 },
  { food: 'Frozen mixed vegetables', unit: 'g', location: StorageLocation.FREEZER, threshold: 1000 },
  { food: 'Chicken breast', unit: 'g', location: StorageLocation.FREEZER, threshold: 1000 },
  { food: 'Bagels', unit: 'each', location: StorageLocation.PANTRY, threshold: 4 },
  { food: 'Eggs', unit: 'each', location: StorageLocation.FRIDGE, threshold: 6 },
  { food: 'Egg whites', unit: 'g', location: StorageLocation.FRIDGE, threshold: 500 },
  { food: 'Avocado', unit: 'each', location: StorageLocation.FRIDGE, threshold: 2 },
  { food: 'Orange', unit: 'each', location: StorageLocation.FRIDGE, threshold: 3 },
  { food: 'Pink Himalayan salt', unit: 'g', location: StorageLocation.PANTRY, threshold: 50 },
  { food: 'Creatine monohydrate', unit: 'g', location: StorageLocation.PANTRY, threshold: 100 },
];

async function main() {
  const username = process.env.ADMIN_USERNAME?.trim() || 'admin';
  const rawPassword = process.env.ADMIN_PASSWORD?.trim();
  const password = rawPassword || 'preptracker';

  console.log('Seeding PrepTracker…');

  // --- User ---------------------------------------------------------------
  let user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        username,
        passwordHash: await hashPassword(password),
        displayName: 'PrepTracker',
        // Force a password change when the built-in default was used.
        mustChangePassword: !rawPassword,
      },
    });
    console.log(`  user "${username}" created`);
  } else {
    console.log(`  user "${username}" already exists, left untouched`);
  }
  const userId = user.id;

  // --- Settings -----------------------------------------------------------
  await prisma.settings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      // The day is built from fixed points and spread between them: the first
      // meal, the pre-workout meal an hour before training (an hour and a half
      // when the session includes legs — see WORKOUT_FOCUSES below), the meal
      // after training, and the last meal in the evening window. Everything
      // else lands wherever the spacing works out, inside 3–4 hours.
      firstMealTime: '08:00',
      mealIntervalMinutes: 180,
      mealIntervalMaxMinutes: 240,
      mealDurationMinutes: 20,
      workoutTime: '19:30',
      workoutDurationMinutes: 60,
      lastMealEarliest: '21:00',
      lastMealLatest: '23:00',
      bedtime: '01:00',
      preWorkoutMinutes: 60,
      postWorkoutMinutes: 30,
      waterTargetMl: 4000,
      quickAddAMl: 250,
      quickAddBMl: 500,
      fridgeDays: 3,
      freezerThawLeadDays: 1,
      defaultPortionG: 175,
      defaultPlanDays: 7,
      weekStartsOn: 1,
      seasoningNote: '1/4 tsp pink salt with each meal.',
    },
  });

  // --- Day types ----------------------------------------------------------
  const training = await prisma.dayType.upsert({
    where: { userId_key: { userId, key: 'training' } },
    update: {},
    create: { userId, key: 'training', name: 'Training', isTraining: true, color: '#16a34a', sortOrder: 0, isDefault: true },
  });
  const rest = await prisma.dayType.upsert({
    where: { userId_key: { userId, key: 'rest' } },
    update: {},
    create: { userId, key: 'rest', name: 'Rest', isTraining: false, color: '#0284c7', sortOrder: 1 },
  });

  // Monday to Friday training, Saturday and Sunday rest.
  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
    const dayTypeId = dayOfWeek <= 5 ? training.id : rest.id;
    await prisma.scheduleDay.upsert({
      where: { userId_dayOfWeek: { userId, dayOfWeek } },
      update: {},
      create: { userId, dayOfWeek, dayTypeId },
    });
  }

  // --- Workout focuses ----------------------------------------------------
  const focusIds = new Map<string, string>();
  for (const [index, focus] of WORKOUT_FOCUSES.entries()) {
    const row = await prisma.workoutFocus.upsert({
      where: { userId_name: { userId, name: focus.name } },
      update: {},
      create: {
        userId,
        name: focus.name,
        category: focus.category,
        sortOrder: index,
        preWorkoutMinutes: focus.preWorkoutMinutes ?? null,
      },
    });
    focusIds.set(focus.name, row.id);
  }
  console.log(`  ${focusIds.size} workout focuses ready`);

  // --- Foods --------------------------------------------------------------
  const foodIds = new Map<string, string>();
  for (const food of FOODS) {
    const row = await prisma.food.upsert({
      where: { userId_name: { userId, name: food.name } },
      update: {},
      create: {
        userId,
        name: food.name,
        category: food.category,
        defaultUnit: food.defaultUnit,
        department: food.department,
        bulkClass: food.bulkClass,
        storageDefault: food.storageDefault,
        packageSize: food.packageSize ?? null,
        packageUnit: food.packageUnit ?? null,
        cookingYieldPct: food.cookingYieldPct ?? null,
        tracksYield: food.tracksYield ?? false,
        nutritionBasisQty: food.basisQty ?? 100,
        nutritionBasisUnit: food.basisUnit ?? 'g',
        calories: food.calories ?? null,
        protein: food.protein ?? null,
        carbs: food.carbs ?? null,
        fat: food.fat ?? null,
        fibre: food.fibre ?? null,
        sodium: food.sodium ?? null,
        notes: food.notes ?? null,
      },
    });
    foodIds.set(food.name, row.id);
  }
  console.log(`  ${foodIds.size} foods ready`);

  // --- Cooking yield defaults --------------------------------------------
  for (const food of FOODS) {
    if (!food.tracksYield || food.cookingYieldPct == null) continue;
    const foodId = foodIds.get(food.name)!;
    const existing = await prisma.cookingYield.findFirst({ where: { userId, foodId, source: YieldSource.DEFAULT } });
    if (existing) continue;
    await prisma.cookingYield.create({
      data: {
        userId,
        foodId,
        foodName: food.name,
        yieldPct: food.cookingYieldPct,
        source: YieldSource.DEFAULT,
        note: 'Starting estimate. Record a prep batch to replace it with your own measurement.',
      },
    });
  }

  // --- Option groups ------------------------------------------------------
  const groupIds = new Map<string, string>();
  for (const group of OPTION_GROUPS) {
    const row = await prisma.foodOptionGroup.upsert({
      where: { userId_name: { userId, name: group.name } },
      update: {},
      create: {
        userId,
        name: group.name,
        notes: group.notes ?? null,
        preferredFoodId: foodIds.get(group.preferred) ?? null,
      },
    });
    groupIds.set(group.name, row.id);

    for (const [index, member] of group.members.entries()) {
      const foodId = foodIds.get(member);
      if (!foodId) continue;
      await prisma.foodOptionGroupMember.upsert({
        where: { groupId_foodId: { groupId: row.id, foodId } },
        update: { sortOrder: index },
        create: { groupId: row.id, foodId, sortOrder: index },
      });
    }
  }
  console.log(`  ${groupIds.size} substitution groups ready`);

  // --- Meal plan ----------------------------------------------------------
  const existingPlan = await prisma.mealPlan.findFirst({ where: { userId } });
  if (existingPlan) {
    console.log('  meal plan already exists, leaving it untouched');
  } else {
    const plan = await prisma.mealPlan.create({
      data: {
        userId,
        name: 'Current plan',
        description: 'Seeded starting plan. Every meal, ingredient and quantity here is editable.',
        isActive: true,
      },
    });

    const mealIds = new Map<string, string>();

    for (const [mealIndex, meal] of MEALS.entries()) {
      const mealRow = await prisma.meal.create({
        data: {
          mealPlanId: plan.id,
          name: meal.name,
          description: meal.description ?? null,
          sortOrder: mealIndex,
          defaultTime: meal.defaultTime,
          windowMinutes: meal.windowMinutes ?? null,
          isPreWorkout: meal.isPreWorkout ?? false,
          isPostWorkout: meal.isPostWorkout ?? false,
          dayTypeSettings: {
            create: [
              { dayTypeId: training.id, included: true },
              { dayTypeId: rest.id, included: true },
            ],
          },
        },
      });
      mealIds.set(meal.name, mealRow.id);

      for (const [ingredientIndex, ingredient] of meal.ingredients.entries()) {
        await prisma.mealIngredient.create({
          data: {
            mealId: mealRow.id,
            foodId: ingredient.food ? (foodIds.get(ingredient.food) ?? null) : null,
            optionGroupId: ingredient.optionGroup ? (groupIds.get(ingredient.optionGroup) ?? null) : null,
            unit: ingredient.unit,
            state: ingredient.state,
            required: ingredient.required ?? true,
            sortOrder: ingredientIndex,
            notes: ingredient.notes ?? null,
            quantities: {
              create: [
                { dayTypeId: training.id, quantity: ingredient.qty.training },
                { dayTypeId: rest.id, quantity: ingredient.qty.rest },
              ],
            },
          },
        });
      }
    }
    console.log(`  meal plan "${plan.name}" created with ${MEALS.length} meals`);

    // --- Supplements ------------------------------------------------------
    for (const [index, supplement] of SUPPLEMENTS.entries()) {
      const row = await prisma.supplement.create({
        data: {
          userId,
          name: supplement.name,
          dosageAmount: supplement.dosageAmount ?? null,
          dosageUnit: supplement.dosageUnit ?? null,
          countPerDose: supplement.countPerDose,
          form: supplement.form,
          notes: supplement.notes ?? null,
          sortOrder: index,
        },
      });
      await prisma.supplementSchedule.create({
        data: {
          supplementId: row.id,
          timing: supplement.timing,
          applicability: supplement.applicability,
          mealId: supplement.mealName ? (mealIds.get(supplement.mealName) ?? null) : null,
          sortOrder: index,
        },
      });
    }
    console.log(`  ${SUPPLEMENTS.length} supplements created`);
  }

  // --- Inventory ----------------------------------------------------------
  const inventoryCount = await prisma.inventoryItem.count({ where: { userId } });
  if (inventoryCount === 0) {
    for (const item of INVENTORY_SEEDS) {
      const foodId = foodIds.get(item.food);
      if (!foodId) continue;
      await prisma.inventoryItem.create({
        data: {
          userId,
          foodId,
          name: item.food,
          quantity: 0,
          unit: item.unit,
          location: item.location,
          lowStockThreshold: item.threshold,
          notes: 'Seeded at zero. Update it with what you actually have.',
        },
      });
    }
    console.log(`  ${INVENTORY_SEEDS.length} inventory items created (all at zero)`);
  }

  console.log('\nSeed complete.');
  if (!rawPassword) {
    console.log(`\n  Sign in with  ${username} / ${password}`);
    console.log('  You will be asked to change this password on first sign-in.\n');
  }
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
