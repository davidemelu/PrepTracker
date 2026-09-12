/**
 * Hydration maths. Everything is stored in millilitres; litres are a display
 * concern only.
 */

import { round } from './units';

export const MAX_SINGLE_ENTRY_ML = 5000;
export const MAX_DAILY_TOTAL_ML = 20000;
/** Two identical amounts inside this window look like a double tap. */
export const DUPLICATE_WINDOW_SECONDS = 10;

export interface WaterEntryLike {
  id: string;
  amountMl: number;
  createdAt: Date | string;
}

export interface WaterProgress {
  totalMl: number;
  targetMl: number;
  remainingMl: number;
  /** Uncapped, so you can see 112% on a heavy day. */
  percent: number;
  /** Capped at 100 for progress bars and rings. */
  percentCapped: number;
  goalReached: boolean;
  entryCount: number;
}

export function waterProgress(entries: readonly WaterEntryLike[], targetMl: number): WaterProgress {
  const totalMl = entries.reduce((sum, e) => sum + (Number.isFinite(e.amountMl) ? e.amountMl : 0), 0);
  return { ...progressFromTotal(totalMl, targetMl), entryCount: entries.length };
}

/**
 * The same arithmetic for a total that is not a list of rows.
 *
 * The water card holds an optimistic total that moves before the server answers,
 * and it has to describe that total the same way the server will when the answer
 * arrives, or the number changes under the user's thumb for no reason.
 */
export function progressFromTotal(totalMl: number, targetMl: number): WaterProgress {
  const safeTotal = Number.isFinite(totalMl) ? Math.max(0, totalMl) : 0;
  const safeTarget = targetMl > 0 ? targetMl : 0;
  const percent = safeTarget > 0 ? round((safeTotal / safeTarget) * 100, 1) : 0;
  return {
    totalMl: safeTotal,
    targetMl: safeTarget,
    remainingMl: Math.max(0, safeTarget - safeTotal),
    percent,
    percentCapped: Math.min(100, Math.max(0, percent)),
    goalReached: safeTarget > 0 && safeTotal >= safeTarget,
    entryCount: 0,
  };
}

export interface WaterValidation {
  ok: boolean;
  message?: string;
}

export function validateWaterAmount(amountMl: number): WaterValidation {
  if (!Number.isFinite(amountMl)) return { ok: false, message: 'Enter an amount in millilitres.' };
  if (amountMl <= 0) return { ok: false, message: 'Water amount must be greater than 0 mL.' };
  if (!Number.isInteger(amountMl)) return { ok: false, message: 'Water amount must be a whole number of millilitres.' };
  if (amountMl > MAX_SINGLE_ENTRY_ML) {
    return { ok: false, message: `A single entry above ${MAX_SINGLE_ENTRY_ML / 1000} L is almost certainly a typo.` };
  }
  return { ok: true };
}

/**
 * Detects an accidental repeat submission: the same amount logged within a few
 * seconds of the last entry. Returns a flag rather than blocking, so a genuine
 * second glass can still be confirmed.
 */
export function isProbableDuplicate(
  entries: readonly WaterEntryLike[],
  amountMl: number,
  now: Date = new Date(),
  windowSeconds = DUPLICATE_WINDOW_SECONDS,
): boolean {
  const last = [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  if (!last || last.amountMl !== amountMl) return false;
  const deltaSeconds = (now.getTime() - new Date(last.createdAt).getTime()) / 1000;
  return deltaSeconds >= 0 && deltaSeconds <= windowSeconds;
}

/** The entry an undo should remove: the most recently created one. */
export function lastEntry(entries: readonly WaterEntryLike[]): WaterEntryLike | null {
  if (entries.length === 0) return null;
  return [...entries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0]!;
}

/** 2500 -> "2.5 L", 750 -> "750 mL" */
export function formatWater(ml: number): string {
  if (Math.abs(ml) >= 1000) {
    const litres = round(ml / 1000, 2);
    return `${litres} L`;
  }
  return `${Math.round(ml)} mL`;
}

export interface DailyWaterSummary {
  date: string;
  totalMl: number;
  targetMl: number;
  percent: number;
}

/** Average daily intake across a set of days, used by the weekly tracker. */
export function averageDailyWater(days: readonly DailyWaterSummary[]): number {
  if (days.length === 0) return 0;
  return Math.round(days.reduce((sum, d) => sum + d.totalMl, 0) / days.length);
}

/**
 * Water adherence over a period. Each day is capped at 100% so one very heavy
 * day cannot hide three dry ones.
 */
export function waterAdherence(days: readonly DailyWaterSummary[]): number {
  if (days.length === 0) return 0;
  const total = days.reduce((sum, d) => {
    if (d.targetMl <= 0) return sum + 100;
    return sum + Math.min(100, (d.totalMl / d.targetMl) * 100);
  }, 0);
  return round(total / days.length, 1);
}
