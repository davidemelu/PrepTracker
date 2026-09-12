-- DropForeignKey
ALTER TABLE "meal_completions" DROP CONSTRAINT "meal_completions_dailyMealId_fkey";

-- DropForeignKey
ALTER TABLE "meal_ingredients" DROP CONSTRAINT "meal_ingredients_foodId_fkey";

-- DropForeignKey
ALTER TABLE "supplement_completions" DROP CONSTRAINT "supplement_completions_dailySupplementId_fkey";

-- DropIndex
DROP INDEX "daily_plans_userId_date_idx";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "cooking_yields_prepBatchId_idx" ON "cooking_yields"("prepBatchId");

-- CreateIndex
CREATE INDEX "cooking_yields_foodId_idx" ON "cooking_yields"("foodId");

-- CreateIndex
CREATE INDEX "daily_meal_items_foodId_idx" ON "daily_meal_items"("foodId");

-- CreateIndex
CREATE INDEX "daily_meal_items_sourceIngredientId_idx" ON "daily_meal_items"("sourceIngredientId");

-- CreateIndex
CREATE INDEX "daily_meals_sourceMealId_idx" ON "daily_meals"("sourceMealId");

-- CreateIndex
CREATE INDEX "daily_plans_dayTypeId_idx" ON "daily_plans"("dayTypeId");

-- CreateIndex
CREATE INDEX "daily_plans_mealPlanId_idx" ON "daily_plans"("mealPlanId");

-- CreateIndex
CREATE INDEX "daily_supplements_supplementId_idx" ON "daily_supplements"("supplementId");

-- CreateIndex
CREATE INDEX "daily_workout_focuses_focusId_idx" ON "daily_workout_focuses"("focusId");

-- CreateIndex
CREATE INDEX "food_option_group_members_foodId_idx" ON "food_option_group_members"("foodId");

-- CreateIndex
CREATE INDEX "food_option_groups_preferredFoodId_idx" ON "food_option_groups"("preferredFoodId");

-- CreateIndex
CREATE INDEX "grocery_items_foodId_idx" ON "grocery_items"("foodId");

-- CreateIndex
CREATE INDEX "inventory_items_foodId_idx" ON "inventory_items"("foodId");

-- CreateIndex
CREATE INDEX "meal_day_type_settings_dayTypeId_idx" ON "meal_day_type_settings"("dayTypeId");

-- CreateIndex
CREATE INDEX "meal_ingredient_quantities_dayTypeId_idx" ON "meal_ingredient_quantities"("dayTypeId");

-- CreateIndex
CREATE INDEX "meal_ingredients_foodId_idx" ON "meal_ingredients"("foodId");

-- CreateIndex
CREATE INDEX "meal_ingredients_optionGroupId_idx" ON "meal_ingredients"("optionGroupId");

-- CreateIndex
CREATE INDEX "plan_week_preferences_optionGroupId_idx" ON "plan_week_preferences"("optionGroupId");

-- CreateIndex
CREATE INDEX "plan_week_preferences_foodId_idx" ON "plan_week_preferences"("foodId");

-- CreateIndex
CREATE INDEX "prep_batches_foodId_idx" ON "prep_batches"("foodId");

-- CreateIndex
CREATE INDEX "prep_sessions_groceryWeekId_idx" ON "prep_sessions"("groceryWeekId");

-- CreateIndex
CREATE INDEX "prep_tasks_foodId_idx" ON "prep_tasks"("foodId");

-- CreateIndex
CREATE INDEX "schedule_day_focuses_focusId_idx" ON "schedule_day_focuses"("focusId");

-- CreateIndex
CREATE INDEX "schedule_days_dayTypeId_idx" ON "schedule_days"("dayTypeId");

-- CreateIndex
CREATE INDEX "storage_portions_prepBatchId_idx" ON "storage_portions"("prepBatchId");

-- CreateIndex
CREATE INDEX "storage_portions_foodId_idx" ON "storage_portions"("foodId");

-- CreateIndex
CREATE INDEX "supplement_schedules_mealId_idx" ON "supplement_schedules"("mealId");

-- CreateIndex
CREATE INDEX "water_entries_dailyPlanId_idx" ON "water_entries"("dailyPlanId");

-- AddForeignKey
ALTER TABLE "meal_ingredients" ADD CONSTRAINT "meal_ingredients_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "foods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_completions" ADD CONSTRAINT "meal_completions_dailyMealId_fkey" FOREIGN KEY ("dailyMealId") REFERENCES "daily_meals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_completions" ADD CONSTRAINT "supplement_completions_dailySupplementId_fkey" FOREIGN KEY ("dailySupplementId") REFERENCES "daily_supplements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
