-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "autoScheduleMeals" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "workout_focuses" ADD COLUMN     "preWorkoutMinutes" INTEGER;
