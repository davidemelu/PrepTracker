-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "lastMealEarliest" TEXT NOT NULL DEFAULT '21:00',
ADD COLUMN     "lastMealLatest" TEXT NOT NULL DEFAULT '23:00',
ADD COLUMN     "mealIntervalMaxMinutes" INTEGER NOT NULL DEFAULT 240;
