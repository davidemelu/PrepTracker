-- CreateEnum
CREATE TYPE "WorkoutFocusCategory" AS ENUM ('MUSCLE_GROUP', 'SPLIT', 'CONDITIONING', 'OTHER');

-- AlterTable
ALTER TABLE "daily_meals" ADD COLUMN     "actualTime" TEXT;

-- AlterTable
ALTER TABLE "daily_plans" ADD COLUMN     "workoutName" TEXT;

-- AlterTable
ALTER TABLE "schedule_days" ADD COLUMN     "workoutName" TEXT;

-- CreateTable
CREATE TABLE "workout_focuses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "WorkoutFocusCategory" NOT NULL DEFAULT 'MUSCLE_GROUP',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_focuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_day_focuses" (
    "id" TEXT NOT NULL,
    "scheduleDayId" TEXT NOT NULL,
    "focusId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "schedule_day_focuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_workout_focuses" (
    "id" TEXT NOT NULL,
    "dailyPlanId" TEXT NOT NULL,
    "focusId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_workout_focuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "workout_focuses_userId_active_idx" ON "workout_focuses"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "workout_focuses_userId_name_key" ON "workout_focuses"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_day_focuses_scheduleDayId_focusId_key" ON "schedule_day_focuses"("scheduleDayId", "focusId");

-- CreateIndex
CREATE INDEX "daily_workout_focuses_dailyPlanId_sortOrder_idx" ON "daily_workout_focuses"("dailyPlanId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "daily_workout_focuses_dailyPlanId_name_key" ON "daily_workout_focuses"("dailyPlanId", "name");

-- AddForeignKey
ALTER TABLE "workout_focuses" ADD CONSTRAINT "workout_focuses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_day_focuses" ADD CONSTRAINT "schedule_day_focuses_scheduleDayId_fkey" FOREIGN KEY ("scheduleDayId") REFERENCES "schedule_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_day_focuses" ADD CONSTRAINT "schedule_day_focuses_focusId_fkey" FOREIGN KEY ("focusId") REFERENCES "workout_focuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_workout_focuses" ADD CONSTRAINT "daily_workout_focuses_dailyPlanId_fkey" FOREIGN KEY ("dailyPlanId") REFERENCES "daily_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_workout_focuses" ADD CONSTRAINT "daily_workout_focuses_focusId_fkey" FOREIGN KEY ("focusId") REFERENCES "workout_focuses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
