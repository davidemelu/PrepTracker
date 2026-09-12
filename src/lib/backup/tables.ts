/**
 * The backup file format version. Bump it when the shape of the file changes in
 * a way an older build could not read.
 */
export const BACKUP_VERSION = 1;

/**
 * The tables a backup carries, parents before children.
 *
 * Foreign keys are enforced, so the order matters twice over: rows are written
 * in this order and deleted in the reverse of it. Kept in its own module so the
 * validator and the export/restore code can share it without importing each
 * other.
 */
export const BACKUP_TABLES = [
  'user',
  'settings',
  'appSetting',
  'dayType',
  'scheduleDay',
  'workoutFocus',
  'scheduleDayFocus',
  'food',
  'foodOptionGroup',
  'foodOptionGroupMember',
  'planWeekPreference',
  'mealPlan',
  'meal',
  'mealDayTypeSetting',
  'mealIngredient',
  'mealIngredientQuantity',
  'supplement',
  'supplementSchedule',
  'dailyPlan',
  'dailyWorkoutFocus',
  'dailyMeal',
  'dailyMealItem',
  'mealCompletion',
  'dailySupplement',
  'supplementCompletion',
  'waterEntry',
  'dailyCheckIn',
  'groceryWeek',
  'groceryItem',
  'inventoryItem',
  'prepSession',
  'prepTask',
  'prepBatch',
  'cookingYield',
  'storagePortion',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
