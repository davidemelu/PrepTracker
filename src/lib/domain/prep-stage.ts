/**
 * Where a prep batch is in the weigh → cook → store sequence. Pure, so the
 * server page and the client card agree on it.
 */

export type BatchStage = 'raw' | 'cooked' | 'store' | 'done';

export interface BatchStageInput {
  rawWeightG: number | null;
  cookedWeightG: number | null;
  storedPortions: number;
}

export function batchStage(batch: BatchStageInput): BatchStage {
  if (batch.rawWeightG == null) return 'raw';
  if (batch.cookedWeightG == null) return 'cooked';
  if (batch.storedPortions === 0) return 'store';
  return 'done';
}
