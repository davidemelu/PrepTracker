-- CreateEnum
CREATE TYPE "FoodCategory" AS ENUM ('PROTEIN', 'CARBOHYDRATE', 'FRUIT', 'VEGETABLE', 'FAT', 'DAIRY', 'SUPPLEMENT', 'SEASONING', 'BEVERAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "IngredientState" AS ENUM ('RAW', 'COOKED', 'AS_IS');

-- CreateEnum
CREATE TYPE "BulkClass" AS ENUM ('EXCELLENT', 'GOOD_IF_FROZEN', 'BUY_FRESH', 'NOT_CLASSIFIED');

-- CreateEnum
CREATE TYPE "StorageLocation" AS ENUM ('PANTRY', 'FRIDGE', 'FREEZER');

-- CreateEnum
CREATE TYPE "MealStatus" AS ENUM ('PENDING', 'COMPLETED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CompletionAction" AS ENUM ('COMPLETED', 'UNDONE', 'SKIPPED', 'UNSKIPPED');

-- CreateEnum
CREATE TYPE "SupplementForm" AS ENUM ('TABLET', 'CAPSULE', 'SOFTGEL', 'SCOOP', 'GUMMY', 'LIQUID', 'POWDER', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplementTiming" AS ENUM ('AM', 'WITH_BREAKFAST', 'AFTER_BREAKFAST', 'PRE_WORKOUT', 'POST_WORKOUT', 'WITH_MEAL', 'EVENING', 'BEFORE_BED', 'ANYTIME');

-- CreateEnum
CREATE TYPE "DayApplicability" AS ENUM ('EVERY_DAY', 'TRAINING_ONLY', 'REST_ONLY');

-- CreateEnum
CREATE TYPE "GroceryWeekStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PrepSessionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "PrepTaskKind" AS ENUM ('COOK', 'PORTION', 'SHOP', 'CLEAN', 'OTHER');

-- CreateEnum
CREATE TYPE "YieldSource" AS ENUM ('DEFAULT', 'MEASURED', 'MANUAL');

-- CreateEnum
CREATE TYPE "PortionStatus" AS ENUM ('READY', 'FROZEN', 'THAWING', 'CONSUMED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "WaterSource" AS ENUM ('QUICK_ADD', 'CUSTOM', 'IMPORT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstMealTime" TEXT NOT NULL DEFAULT '13:00',
    "mealIntervalMinutes" INTEGER NOT NULL DEFAULT 150,
    "mealDurationMinutes" INTEGER NOT NULL DEFAULT 20,
    "workoutTime" TEXT NOT NULL DEFAULT '19:30',
    "workoutDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "bedtime" TEXT NOT NULL DEFAULT '01:00',
    "preWorkoutMinutes" INTEGER NOT NULL DEFAULT 90,
    "postWorkoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "waterTargetMl" INTEGER NOT NULL DEFAULT 4000,
    "quickAddAMl" INTEGER NOT NULL DEFAULT 250,
    "quickAddBMl" INTEGER NOT NULL DEFAULT 500,
    "fridgeDays" INTEGER NOT NULL DEFAULT 3,
    "freezerThawLeadDays" INTEGER NOT NULL DEFAULT 1,
    "defaultPortionG" DOUBLE PRECISION NOT NULL DEFAULT 175,
    "defaultPlanDays" INTEGER NOT NULL DEFAULT 7,
    "weekStartsOn" INTEGER NOT NULL DEFAULT 1,
    "seasoningNote" TEXT,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_types" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isTraining" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "day_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_days" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "dayTypeId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foods" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FoodCategory" NOT NULL DEFAULT 'OTHER',
    "defaultUnit" TEXT NOT NULL DEFAULT 'g',
    "department" TEXT,
    "bulkClass" "BulkClass" NOT NULL DEFAULT 'NOT_CLASSIFIED',
    "storageDefault" "StorageLocation" NOT NULL DEFAULT 'PANTRY',
    "packageSize" DOUBLE PRECISION,
    "packageUnit" TEXT,
    "cookingYieldPct" DOUBLE PRECISION,
    "tracksYield" BOOLEAN NOT NULL DEFAULT false,
    "nutritionBasisQty" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "nutritionBasisUnit" TEXT NOT NULL DEFAULT 'g',
    "calories" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "fibre" DOUBLE PRECISION,
    "sodium" DOUBLE PRECISION,
    "externalSource" TEXT,
    "externalId" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "foods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_option_groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "notes" TEXT,
    "preferredFoodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_option_group_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "food_option_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_week_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "optionGroupId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_week_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meals" (
    "id" TEXT NOT NULL,
    "mealPlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "defaultTime" TEXT,
    "windowMinutes" INTEGER,
    "isPreWorkout" BOOLEAN NOT NULL DEFAULT false,
    "isPostWorkout" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_day_type_settings" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "dayTypeId" TEXT NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "timeOverride" TEXT,

    CONSTRAINT "meal_day_type_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_ingredients" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "foodId" TEXT,
    "optionGroupId" TEXT,
    "unit" TEXT NOT NULL,
    "state" "IngredientState" NOT NULL DEFAULT 'AS_IS',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_ingredient_quantities" (
    "id" TEXT NOT NULL,
    "mealIngredientId" TEXT NOT NULL,
    "dayTypeId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "meal_ingredient_quantities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosageAmount" DOUBLE PRECISION,
    "dosageUnit" TEXT,
    "countPerDose" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "form" "SupplementForm" NOT NULL DEFAULT 'CAPSULE',
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_schedules" (
    "id" TEXT NOT NULL,
    "supplementId" TEXT NOT NULL,
    "timing" "SupplementTiming" NOT NULL DEFAULT 'ANYTIME',
    "mealId" TEXT,
    "timeOfDay" TEXT,
    "applicability" "DayApplicability" NOT NULL DEFAULT 'EVERY_DAY',
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "supplement_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_plans" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "dayTypeId" TEXT,
    "dayTypeName" TEXT NOT NULL,
    "dayTypeIsTraining" BOOLEAN NOT NULL DEFAULT false,
    "mealPlanId" TEXT,
    "mealPlanName" TEXT NOT NULL,
    "waterTargetMl" INTEGER NOT NULL DEFAULT 4000,
    "workoutTime" TEXT,
    "notes" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_meals" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "sourceMealId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "scheduledTime" TEXT,
    "windowMinutes" INTEGER,
    "isPreWorkout" BOOLEAN NOT NULL DEFAULT false,
    "status" "MealStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_meals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_meal_items" (
    "id" TEXT NOT NULL,
    "dailyMealId" TEXT NOT NULL,
    "sourceIngredientId" TEXT,
    "foodId" TEXT,
    "foodName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "state" "IngredientState" NOT NULL DEFAULT 'AS_IS',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "optionGroupId" TEXT,
    "optionGroupName" TEXT,
    "isSubstituted" BOOLEAN NOT NULL DEFAULT false,
    "isQuantityOverridden" BOOLEAN NOT NULL DEFAULT false,
    "calories" DOUBLE PRECISION,
    "protein" DOUBLE PRECISION,
    "carbs" DOUBLE PRECISION,
    "fat" DOUBLE PRECISION,
    "fibre" DOUBLE PRECISION,
    "sodium" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "daily_meal_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_completions" (
    "id" TEXT NOT NULL,
    "dailyMealId" TEXT NOT NULL,
    "action" "CompletionAction" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "meal_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_supplements" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "supplementId" TEXT,
    "name" TEXT NOT NULL,
    "dosageAmount" DOUBLE PRECISION,
    "dosageUnit" TEXT,
    "countPerDose" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "form" "SupplementForm" NOT NULL DEFAULT 'CAPSULE',
    "timing" "SupplementTiming" NOT NULL DEFAULT 'ANYTIME',
    "timingLabel" TEXT NOT NULL,
    "timeOfDay" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "MealStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "daily_supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_completions" (
    "id" TEXT NOT NULL,
    "dailySupplementId" TEXT NOT NULL,
    "action" "CompletionAction" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplement_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyPlanId" TEXT,
    "date" DATE NOT NULL,
    "amountMl" INTEGER NOT NULL,
    "source" "WaterSource" NOT NULL DEFAULT 'QUICK_ADD',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "water_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_check_ins" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "ratingHunger" INTEGER,
    "ratingEnergy" INTEGER,
    "ratingTraining" INTEGER,
    "ratingAdherence" INTEGER,
    "digestionNote" TEXT,
    "workoutNote" TEXT,
    "mealDifficultyNote" TEXT,
    "prepIssueNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_weeks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "daysPlanned" INTEGER NOT NULL DEFAULT 7,
    "trainingDays" INTEGER NOT NULL DEFAULT 5,
    "restDays" INTEGER NOT NULL DEFAULT 2,
    "status" "GroceryWeekStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "inventoryApplied" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_weeks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grocery_items" (
    "id" TEXT NOT NULL,
    "groceryWeekId" TEXT NOT NULL,
    "foodId" TEXT,
    "name" TEXT NOT NULL,
    "category" "FoodCategory" NOT NULL DEFAULT 'OTHER',
    "department" TEXT,
    "requiredQty" DOUBLE PRECISION NOT NULL,
    "requiredUnit" TEXT NOT NULL,
    "shoppingQty" DOUBLE PRECISION NOT NULL,
    "shoppingUnit" TEXT NOT NULL,
    "cookedQty" DOUBLE PRECISION,
    "rawQty" DOUBLE PRECISION,
    "yieldPctUsed" DOUBLE PRECISION,
    "inventoryQty" DOUBLE PRECISION,
    "inventoryNote" TEXT,
    "estimatedPackages" DOUBLE PRECISION,
    "packageSize" DOUBLE PRECISION,
    "packageUnit" TEXT,
    "haveAlready" BOOLEAN NOT NULL DEFAULT false,
    "purchased" BOOLEAN NOT NULL DEFAULT false,
    "isAdHoc" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grocery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "foodId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "location" "StorageLocation" NOT NULL DEFAULT 'PANTRY',
    "lowStockThreshold" DOUBLE PRECISION,
    "expiresOn" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groceryWeekId" TEXT,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "daysCovered" INTEGER NOT NULL DEFAULT 7,
    "trainingDays" INTEGER NOT NULL DEFAULT 5,
    "restDays" INTEGER NOT NULL DEFAULT 2,
    "status" "PrepSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prep_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_tasks" (
    "id" TEXT NOT NULL,
    "prepSessionId" TEXT NOT NULL,
    "foodId" TEXT,
    "title" TEXT NOT NULL,
    "kind" "PrepTaskKind" NOT NULL DEFAULT 'OTHER',
    "targetQty" DOUBLE PRECISION,
    "unit" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "prep_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_batches" (
    "id" TEXT NOT NULL,
    "prepSessionId" TEXT NOT NULL,
    "foodId" TEXT,
    "foodName" TEXT NOT NULL,
    "targetCookedG" DOUBLE PRECISION,
    "rawWeightG" DOUBLE PRECISION,
    "cookedWeightG" DOUBLE PRECISION,
    "measuredYieldPct" DOUBLE PRECISION,
    "portionSizeG" DOUBLE PRECISION NOT NULL DEFAULT 175,
    "portionsPlanned" INTEGER,
    "portionsMade" INTEGER,
    "containersPrepared" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prep_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cooking_yields" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "foodId" TEXT,
    "foodName" TEXT NOT NULL,
    "yieldPct" DOUBLE PRECISION NOT NULL,
    "source" "YieldSource" NOT NULL DEFAULT 'MEASURED',
    "rawWeightG" DOUBLE PRECISION,
    "cookedWeightG" DOUBLE PRECISION,
    "prepBatchId" TEXT,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cooking_yields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_portions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prepBatchId" TEXT,
    "foodId" TEXT,
    "label" TEXT NOT NULL,
    "portions" INTEGER NOT NULL DEFAULT 1,
    "portionSizeG" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'g',
    "location" "StorageLocation" NOT NULL DEFAULT 'FRIDGE',
    "status" "PortionStatus" NOT NULL DEFAULT 'READY',
    "prepDate" DATE NOT NULL,
    "refrigerateOn" DATE,
    "freezeOn" DATE,
    "thawOn" DATE,
    "useByDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_portions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "settings_userId_key" ON "settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "app_settings_userId_key_key" ON "app_settings"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "day_types_userId_key_key" ON "day_types"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_days_userId_dayOfWeek_key" ON "schedule_days"("userId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "foods_userId_category_idx" ON "foods"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "foods_userId_name_key" ON "foods"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "food_option_groups_userId_name_key" ON "food_option_groups"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "food_option_group_members_groupId_foodId_key" ON "food_option_group_members"("groupId", "foodId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_week_preferences_userId_weekStart_optionGroupId_key" ON "plan_week_preferences"("userId", "weekStart", "optionGroupId");

-- CreateIndex
CREATE INDEX "meal_plans_userId_isActive_idx" ON "meal_plans"("userId", "isActive");

-- CreateIndex
CREATE INDEX "meals_mealPlanId_sortOrder_idx" ON "meals"("mealPlanId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "meal_day_type_settings_mealId_dayTypeId_key" ON "meal_day_type_settings"("mealId", "dayTypeId");

-- CreateIndex
CREATE INDEX "meal_ingredients_mealId_sortOrder_idx" ON "meal_ingredients"("mealId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "meal_ingredient_quantities_mealIngredientId_dayTypeId_key" ON "meal_ingredient_quantities"("mealIngredientId", "dayTypeId");

-- CreateIndex
CREATE INDEX "supplements_userId_active_idx" ON "supplements"("userId", "active");

-- CreateIndex
CREATE INDEX "supplement_schedules_supplementId_idx" ON "supplement_schedules"("supplementId");

-- CreateIndex
CREATE INDEX "daily_plans_userId_date_idx" ON "daily_plans"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_plans_userId_date_key" ON "daily_plans"("userId", "date");

-- CreateIndex
CREATE INDEX "daily_meals_dailyPlanId_sortOrder_idx" ON "daily_meals"("dailyPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "daily_meal_items_dailyMealId_sortOrder_idx" ON "daily_meal_items"("dailyMealId", "sortOrder");

-- CreateIndex
CREATE INDEX "meal_completions_dailyMealId_at_idx" ON "meal_completions"("dailyMealId", "at");

-- CreateIndex
CREATE INDEX "daily_supplements_dailyPlanId_sortOrder_idx" ON "daily_supplements"("dailyPlanId", "sortOrder");

-- CreateIndex
CREATE INDEX "supplement_completions_dailySupplementId_at_idx" ON "supplement_completions"("dailySupplementId", "at");

-- CreateIndex
CREATE INDEX "water_entries_userId_date_idx" ON "water_entries"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_check_ins_dailyPlanId_key" ON "daily_check_ins"("dailyPlanId");

-- CreateIndex
CREATE INDEX "grocery_weeks_userId_startDate_idx" ON "grocery_weeks"("userId", "startDate");

-- CreateIndex
CREATE INDEX "grocery_items_groceryWeekId_category_idx" ON "grocery_items"("groceryWeekId", "category");

-- CreateIndex
CREATE INDEX "inventory_items_userId_location_idx" ON "inventory_items"("userId", "location");

-- CreateIndex
CREATE INDEX "prep_sessions_userId_date_idx" ON "prep_sessions"("userId", "date");

-- CreateIndex
CREATE INDEX "prep_tasks_prepSessionId_sortOrder_idx" ON "prep_tasks"("prepSessionId", "sortOrder");

-- CreateIndex
CREATE INDEX "prep_batches_prepSessionId_idx" ON "prep_batches"("prepSessionId");

-- CreateIndex
CREATE INDEX "cooking_yields_userId_foodId_recordedAt_idx" ON "cooking_yields"("userId", "foodId", "recordedAt");

-- CreateIndex
CREATE INDEX "storage_portions_userId_status_idx" ON "storage_portions"("userId", "status");

-- CreateIndex
CREATE INDEX "storage_portions_userId_thawOn_idx" ON "storage_portions"("userId", "thawOn");

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_types" ADD CONSTRAINT "day_types_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_days" ADD CONSTRAINT "schedule_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_days" ADD CONSTRAINT "schedule_days_dayTypeId_fkey" FOREIGN KEY ("dayTypeId") REFERENCES "day_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foods" ADD CONSTRAINT "foods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_option_groups" ADD CONSTRAINT "food_option_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_option_groups" ADD CONSTRAINT "food_option_groups_preferredFoodId_fkey" FOREIGN KEY ("preferredFoodId") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_option_group_members" ADD CONSTRAINT "food_option_group_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "food_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_option_group_members" ADD CONSTRAINT "food_option_group_members_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_week_preferences" ADD CONSTRAINT "plan_week_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_week_preferences" ADD CONSTRAINT "plan_week_preferences_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "food_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_week_preferences" ADD CONSTRAINT "plan_week_preferences_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "meal_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_day_type_settings" ADD CONSTRAINT "meal_day_type_settings_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_day_type_settings" ADD CONSTRAINT "meal_day_type_settings_dayTypeId_fkey" FOREIGN KEY ("dayTypeId") REFERENCES "day_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_ingredients" ADD CONSTRAINT "meal_ingredients_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_ingredients" ADD CONSTRAINT "meal_ingredients_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_ingredients" ADD CONSTRAINT "meal_ingredients_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "food_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_ingredient_quantities" ADD CONSTRAINT "meal_ingredient_quantities_mealIngredientId_fkey" FOREIGN KEY ("mealIngredientId") REFERENCES "meal_ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_ingredient_quantities" ADD CONSTRAINT "meal_ingredient_quantities_dayTypeId_fkey" FOREIGN KEY ("dayTypeId") REFERENCES "day_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplements" ADD CONSTRAINT "supplements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_schedules" ADD CONSTRAINT "supplement_schedules_supplementId_fkey" FOREIGN KEY ("supplementId") REFERENCES "supplements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_schedules" ADD CONSTRAINT "supplement_schedules_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_dayTypeId_fkey" FOREIGN KEY ("dayTypeId") REFERENCES "day_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "meal_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_meals" ADD CONSTRAINT "daily_meals_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "daily_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_meals" ADD CONSTRAINT "daily_meals_sourceMealId_fkey" FOREIGN KEY ("sourceMealId") REFERENCES "meals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_meal_items" ADD CONSTRAINT "daily_meal_items_dailyMealId_fkey" FOREIGN KEY ("dailyMealId") REFERENCES "daily_meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_meal_items" ADD CONSTRAINT "daily_meal_items_sourceIngredientId_fkey" FOREIGN KEY ("sourceIngredientId") REFERENCES "meal_ingredients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_meal_items" ADD CONSTRAINT "daily_meal_items_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_completions" ADD CONSTRAINT "meal_completions_dailyMealId_fkey" FOREIGN KEY ("dailyMealId") REFERENCES "daily_meals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_supplements" ADD CONSTRAINT "daily_supplements_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "daily_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_supplements" ADD CONSTRAINT "daily_supplements_supplementId_fkey" FOREIGN KEY ("supplementId") REFERENCES "supplements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_completions" ADD CONSTRAINT "supplement_completions_dailySupplementId_fkey" FOREIGN KEY ("dailySupplementId") REFERENCES "daily_supplements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_entries" ADD CONSTRAINT "water_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_entries" ADD CONSTRAINT "water_entries_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "daily_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_check_ins" ADD CONSTRAINT "daily_check_ins_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "daily_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_weeks" ADD CONSTRAINT "grocery_weeks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_groceryWeekId_fkey" FOREIGN KEY ("groceryWeekId") REFERENCES "grocery_weeks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grocery_items" ADD CONSTRAINT "grocery_items_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_sessions" ADD CONSTRAINT "prep_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_sessions" ADD CONSTRAINT "prep_sessions_groceryWeekId_fkey" FOREIGN KEY ("groceryWeekId") REFERENCES "grocery_weeks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_tasks" ADD CONSTRAINT "prep_tasks_prepSessionId_fkey" FOREIGN KEY ("prepSessionId") REFERENCES "prep_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_tasks" ADD CONSTRAINT "prep_tasks_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_batches" ADD CONSTRAINT "prep_batches_prepSessionId_fkey" FOREIGN KEY ("prepSessionId") REFERENCES "prep_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_batches" ADD CONSTRAINT "prep_batches_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_yields" ADD CONSTRAINT "cooking_yields_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_yields" ADD CONSTRAINT "cooking_yields_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cooking_yields" ADD CONSTRAINT "cooking_yields_prepBatchId_fkey" FOREIGN KEY ("prepBatchId") REFERENCES "prep_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_portions" ADD CONSTRAINT "storage_portions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_portions" ADD CONSTRAINT "storage_portions_prepBatchId_fkey" FOREIGN KEY ("prepBatchId") REFERENCES "prep_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_portions" ADD CONSTRAINT "storage_portions_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
