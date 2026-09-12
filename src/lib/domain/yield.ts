/**
 * Raw <-> cooked weight conversion and cooking yield measurement.
 *
 * The plan is written in cooked weights, but shopping happens in raw weights:
 *
 *     raw = cooked / (yield% / 100)
 *
 * Yields start as editable defaults and are replaced by what actually comes off
 * your scale, so the numbers get more accurate the more you cook.
 */

import { round } from './units';

export const MIN_YIELD_PCT = 0.1;
/** Above 100% means the food gained weight while cooking (rice, oats, pasta). */
export const MAX_PLAUSIBLE_YIELD_PCT = 100;
export const MAX_YIELD_PCT = 1000;

export interface YieldValidation {
  ok: boolean;
  /** True when the value is legal but needs an explicit confirmation. */
  needsConfirmation: boolean;
  message?: string;
}

export function validateYieldPct(pct: number): YieldValidation {
  if (!Number.isFinite(pct)) {
    return { ok: false, needsConfirmation: false, message: 'Enter a cooking yield percentage.' };
  }
  if (pct <= 0) {
    return {
      ok: false,
      needsConfirmation: false,
      message: 'Cooking yield must be greater than 0%. A yield of 0 would mean no food is left after cooking.',
    };
  }
  if (pct < MIN_YIELD_PCT) {
    return {
      ok: false,
      needsConfirmation: false,
      message: `Cooking yield must be at least ${MIN_YIELD_PCT}%.`,
    };
  }
  if (pct > MAX_YIELD_PCT) {
    return {
      ok: false,
      needsConfirmation: false,
      message: `Cooking yield above ${MAX_YIELD_PCT}% is almost certainly a typo.`,
    };
  }
  if (pct > MAX_PLAUSIBLE_YIELD_PCT) {
    return {
      ok: true,
      needsConfirmation: true,
      message: `${round(pct, 1)}% means the food gains weight while cooking. That is right for rice, oats and pasta, but not for meat — confirm to save it.`,
    };
  }
  return { ok: true, needsConfirmation: false };
}

/** Cooked weight you need -> raw weight to buy. */
export function cookedToRaw(cookedQty: number, yieldPct: number): number {
  if (yieldPct <= 0) {
    throw new Error('Cooking yield must be greater than 0% to convert cooked weight to raw.');
  }
  return cookedQty / (yieldPct / 100);
}

/** Raw weight you have -> cooked weight it will produce. */
export function rawToCooked(rawQty: number, yieldPct: number): number {
  if (yieldPct <= 0) {
    throw new Error('Cooking yield must be greater than 0% to convert raw weight to cooked.');
  }
  return rawQty * (yieldPct / 100);
}

/** What a batch actually yielded, as a percentage. */
export function measureYield(rawWeightG: number, cookedWeightG: number): number {
  if (rawWeightG <= 0) {
    throw new Error('Raw batch weight must be greater than 0 to measure a yield.');
  }
  if (cookedWeightG < 0) {
    throw new Error('Cooked batch weight cannot be negative.');
  }
  return round((cookedWeightG / rawWeightG) * 100, 2);
}

export interface PortionPlan {
  /** Whole portions the batch can fill at the target size. */
  portions: number;
  /** Grams left over after taking whole portions. */
  leftoverG: number;
  /** Portion size actually used. */
  portionSizeG: number;
  /** Portions still missing versus the target, 0 when the batch is sufficient. */
  shortfallPortions: number;
  shortfallG: number;
}

/**
 * How many portions a cooked batch makes, and whether that covers the plan.
 *
 * Deliberately floors: eleven and a half portions is eleven containers plus
 * leftovers, not twelve short ones.
 */
export function planPortions(
  cookedWeightG: number,
  portionSizeG: number,
  targetPortions?: number,
): PortionPlan {
  if (portionSizeG <= 0) {
    throw new Error('Portion size must be greater than 0 g.');
  }
  const safeCooked = Math.max(0, cookedWeightG);
  const portions = Math.floor(safeCooked / portionSizeG);
  const leftoverG = round(safeCooked - portions * portionSizeG, 1);
  const shortfallPortions = targetPortions ? Math.max(0, targetPortions - portions) : 0;
  return {
    portions,
    leftoverG,
    portionSizeG,
    shortfallPortions,
    shortfallG: round(shortfallPortions * portionSizeG, 1),
  };
}

/**
 * Containers needed to hold a cooked amount.
 *
 * Ceils, unlike `planPortions`: this answers "how many portions does the plan
 * ask for", where a part portion still has to go somewhere, rather than "how
 * many did this batch make". The rounding before the ceiling stops 2450/175
 * arriving as 14.000000000000002 and asking for fifteen containers.
 */
export function portionsRequired(cookedQty: number, portionSizeG: number): number {
  if (!Number.isFinite(cookedQty) || !Number.isFinite(portionSizeG) || portionSizeG <= 0) return 0;
  return Math.ceil(round(Math.max(0, cookedQty) / portionSizeG, 4));
}

export interface YieldObservation {
  yieldPct: number;
  recordedAt: Date | string;
  source?: 'DEFAULT' | 'MEASURED' | 'MANUAL';
}

/**
 * Effective yield for a food: the mean of the most recent measured batches,
 * falling back to what you set by hand, and then to the seeded default.
 *
 * A rolling mean rather than "last value wins" so a single odd batch (a lid
 * left off, a very thick steak) does not swing next week's shopping list.
 *
 * Measurements outrank manual values outright rather than being averaged with
 * them. A number you typed is an estimate; a number off the scale is evidence,
 * and mixing the two meant one measured batch after a hand-set value landed
 * halfway between the two — so the food said 76% when the only thing ever
 * weighed came out at 70%.
 */
export function effectiveYield(
  observations: readonly YieldObservation[],
  fallbackPct?: number | null,
  sampleSize = 5,
): number | null {
  const usable = observations
    .filter((o) => Number.isFinite(o.yieldPct) && o.yieldPct > 0)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  const measured = usable.filter((o) => o.source === 'MEASURED').slice(0, Math.max(1, sampleSize));
  if (measured.length > 0) {
    const total = measured.reduce((sum, o) => sum + o.yieldPct, 0);
    return round(total / measured.length, 2);
  }

  // Nothing weighed yet: the most recent deliberate value, then the seed.
  const manual = usable.find((o) => o.source === 'MANUAL');
  if (manual) return round(manual.yieldPct, 2);

  return fallbackPct != null && fallbackPct > 0 ? round(fallbackPct, 2) : null;
}
