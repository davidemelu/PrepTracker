'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronDown, ChevronRight, Loader2, Snowflake } from 'lucide-react';
import { toast } from 'sonner';
import { storeBatchPortions, updatePrepBatch } from '@/lib/actions/prep';
import { batchStage } from '@/lib/domain/prep-stage';
import { cookedToRaw, measureYield, planPortions } from '@/lib/domain/yield';
import { formatAmount } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NumberInput } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

export interface BatchRow {
  id: string;
  foodName: string;
  targetCookedG: number | null;
  rawWeightG: number | null;
  cookedWeightG: number | null;
  measuredYieldPct: number | null;
  portionSizeG: number;
  portionsPlanned: number | null;
  portionsMade: number | null;
  containersPrepared: number | null;
  /** The food's current effective yield, used to suggest a raw weight. */
  expectedYieldPct: number | null;
  storedPortions: number;
}

const toNumber = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
};

function StepMarker({ n, state }: { n: number; state: 'done' | 'active' | 'todo' }) {
  return (
    <span
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        state === 'done' && 'bg-success/15 text-success',
        state === 'active' && 'bg-primary text-primary-foreground',
        state === 'todo' && 'bg-secondary text-muted-foreground',
      )}
      aria-hidden
    >
      {state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : n}
    </span>
  );
}

/**
 * One food being batch cooked as a guided sequence: weigh raw → cook and
 * weigh → store. Only the current step takes input; finished steps collapse to
 * their value, and a finished batch collapses to one line.
 */
export function BatchCard({
  batch,
  prepDate,
  daysCovered,
  active,
}: {
  batch: BatchRow;
  prepDate: string;
  daysCovered: number;
  active: boolean;
}) {
  const stage = batchStage(batch);
  const [open, setOpen] = useState<boolean | null>(null);
  const expanded = open ?? active;

  const [raw, setRaw] = useState(batch.rawWeightG != null ? String(batch.rawWeightG) : '');
  const [cooked, setCooked] = useState(batch.cookedWeightG != null ? String(batch.cookedWeightG) : '');
  const [portionSize, setPortionSize] = useState(String(batch.portionSizeG));
  const [perDay, setPerDay] = useState(
    String(Math.max(1, Math.round((batch.portionsMade ?? batch.portionsPlanned ?? daysCovered) / Math.max(1, daysCovered)))),
  );

  const save = useAction(updatePrepBatch, {
    successToast: false,
    onNeedsConfirmation: (message) => {
      toast.warning(message, { action: { label: 'Save anyway', onClick: () => submitCooked(true) } });
    },
  });
  const store = useAction(storeBatchPortions, { successToast: false });

  // Both of these were worked out here with their own rounding, so the number
  // shown live and the number the server stored disagreed in the last digit.
  const suggestedRaw =
    batch.targetCookedG != null && batch.expectedYieldPct
      ? Math.round(cookedToRaw(batch.targetCookedG, batch.expectedYieldPct))
      : null;

  const rawNow = toNumber(raw);
  const cookedNow = toNumber(cooked);
  const sizeNow = toNumber(portionSize) ?? batch.portionSizeG;
  const preview = cookedNow != null && sizeNow > 0 ? planPortions(cookedNow, sizeNow, batch.portionsPlanned ?? undefined) : null;
  const liveYield =
    rawNow != null && rawNow > 0 && cookedNow != null && cookedNow >= 0
      ? measureYield(rawNow, cookedNow)
      : null;

  const submitRaw = () =>
    save.run({ id: batch.id, rawWeightG: rawNow ?? suggestedRaw ?? undefined } as unknown as Parameters<typeof updatePrepBatch>[0]);

  const submitCooked = (confirmYield = false) =>
    save.run({
      id: batch.id,
      rawWeightG: rawNow ?? batch.rawWeightG ?? undefined,
      cookedWeightG: cookedNow,
      portionSizeG: sizeNow,
      confirmYield,
    } as unknown as Parameters<typeof updatePrepBatch>[0]);

  const portions = batch.portionsMade ?? preview?.portions ?? batch.portionsPlanned ?? 0;

  const summary =
    stage === 'done'
      ? `${batch.portionsMade ?? batch.storedPortions} × ${batch.portionSizeG} g stored · ${batch.measuredYieldPct ?? '—'}% yield`
      : stage === 'store'
        ? `${batch.portionsMade} × ${batch.portionSizeG} g cooked · ready to store`
        : `Need ${batch.targetCookedG != null ? formatAmount(batch.targetCookedG, 'g') : '—'} cooked${batch.portionsPlanned ? ` · ${batch.portionsPlanned} × ${batch.portionSizeG} g` : ''}`;

  return (
    <Card className={cn('overflow-hidden', stage === 'done' && 'border-success/40', active && 'border-primary/40 ring-1 ring-primary/15')}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setOpen(!expanded)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left"
      >
        {stage === 'done' ? (
          <Check className="size-5 shrink-0 text-success" strokeWidth={3} aria-hidden />
        ) : (
          <span className="size-5 shrink-0 rounded-full border-2 border-input" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <h3 className="text-[17px] font-semibold leading-6">{batch.foodName}</h3>
          <span className="tabular block text-[13px] text-muted-foreground">{summary}</span>
        </span>
        {expanded ? <ChevronDown className="size-5 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-5 text-muted-foreground" aria-hidden />}
      </button>

      {expanded ? (
        <div className="space-y-1 px-4 pb-4">
          {/* Step 1 ---------------------------------------------------------- */}
          <div className="flex items-start gap-3 border-t border-border py-3">
            <StepMarker n={1} state={stage === 'raw' ? 'active' : 'done'} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">Weigh raw</span>
                {stage !== 'raw' ? (
                  <button type="button" className="-mr-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold tabular" onClick={() => save.run({ id: batch.id, rawWeightG: undefined, cookedWeightG: undefined } as unknown as Parameters<typeof updatePrepBatch>[0])}>
                    {batch.rawWeightG != null ? formatAmount(batch.rawWeightG, 'g') : ''}
                    <span className="sr-only">, tap to change</span>
                  </button>
                ) : null}
              </div>
              {stage === 'raw' ? (
                <>
                  {suggestedRaw ? (
                    <p className="text-xs text-muted-foreground">
                      Start with about <span className="font-medium text-foreground">{suggestedRaw} g raw</span> at your current {batch.expectedYieldPct}% yield.
                    </p>
                  ) : null}
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`raw-${batch.id}`} className="sr-only">Raw weight in grams for {batch.foodName}</Label>
                    <NumberInput
                      id={`raw-${batch.id}`}
                      aria-label={`Raw weight in grams for ${batch.foodName}`}
                      value={raw}
                      onChange={(e) => setRaw(e.target.value)}
                      placeholder={suggestedRaw ? String(suggestedRaw) : '0'}
                    />
                    <span className="w-8 text-sm text-muted-foreground">g</span>
                  </div>
                  <Button size="block" disabled={save.isPending || (rawNow == null && suggestedRaw == null)} onClick={submitRaw}>
                    {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Next: cook it
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {/* Step 2 ---------------------------------------------------------- */}
          <div className="flex items-start gap-3 border-t border-border py-3">
            <StepMarker n={2} state={stage === 'cooked' ? 'active' : stage === 'raw' ? 'todo' : 'done'} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={cn('font-medium', stage === 'raw' && 'text-muted-foreground')}>Cook, then weigh</span>
                {stage === 'store' || stage === 'done' ? (
                  <span className="-mr-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold tabular">
                    {batch.cookedWeightG != null ? formatAmount(batch.cookedWeightG, 'g') : ''}
                    {batch.measuredYieldPct != null ? <span className="text-muted-foreground"> · {batch.measuredYieldPct}%</span> : null}
                  </span>
                ) : null}
              </div>
              {stage === 'cooked' ? (
                <>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`cooked-${batch.id}`} className="sr-only">Cooked weight in grams for {batch.foodName}</Label>
                    <NumberInput
                      id={`cooked-${batch.id}`}
                      aria-label={`Cooked weight in grams for ${batch.foodName}`}
                      value={cooked}
                      onChange={(e) => setCooked(e.target.value)}
                      placeholder="0"
                    />
                    <span className="w-8 text-sm text-muted-foreground">g</span>
                  </div>
                  {liveYield != null ? (
                    <div className="rounded-lg bg-muted p-3 text-sm">
                      <p>
                        <span className="tabular text-[17px] font-semibold">{liveYield}%</span>
                        <span className="text-muted-foreground"> actual yield{batch.expectedYieldPct ? ` · expected ${batch.expectedYieldPct}%` : ''}</span>
                      </p>
                      {preview ? (
                        <p className="mt-0.5">
                          <span className="tabular text-[17px] font-semibold">{preview.portions}</span> portions of {sizeNow} g
                          {preview.leftoverG > 0 ? <span className="text-muted-foreground"> · {preview.leftoverG} g left over</span> : null}
                          {preview.shortfallPortions > 0 ? (
                            <span className="block text-warning">
                              {preview.shortfallPortions} portion{preview.shortfallPortions === 1 ? '' : 's'} short of the {batch.portionsPlanned} planned.
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  <details>
                    <summary className="cursor-pointer list-none text-sm text-primary">Change the portion size ({sizeNow} g)</summary>
                    <div className="mt-2 flex items-center gap-2">
                      <NumberInput id={`size-${batch.id}`} aria-label={`Portion size in grams for ${batch.foodName}`} value={portionSize} onChange={(e) => setPortionSize(e.target.value)} />
                      <span className="w-8 text-sm text-muted-foreground">g</span>
                    </div>
                  </details>
                  <Button size="block" aria-label={`Save the ${batch.foodName} batch`} disabled={save.isPending || cookedNow == null} onClick={() => submitCooked()}>
                    {save.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    Next: store portions
                  </Button>
                  <p className="text-xs text-muted-foreground">Saving updates the yield used for future shopping lists.</p>
                </>
              ) : null}
            </div>
          </div>

          {/* Step 3 ---------------------------------------------------------- */}
          <div className="flex items-start gap-3 border-t border-border py-3">
            <StepMarker n={3} state={stage === 'store' ? 'active' : stage === 'done' ? 'done' : 'todo'} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className={cn('font-medium', stage !== 'store' && stage !== 'done' && 'text-muted-foreground')}>Store</span>
                {stage === 'done' ? (
                  <Link href="/prep/storage" className="-mr-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-primary">
                    {batch.storedPortions} stored
                  </Link>
                ) : null}
              </div>
              {stage === 'store' ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Fridge for the first days, the rest frozen with a thaw date each. Uses your storage settings.
                  </p>
                  <div className="flex items-center gap-3">
                    <Label htmlFor={`perday-${batch.id}`} className="flex-1">Portions eaten per day</Label>
                    <NumberInput id={`perday-${batch.id}`} className="w-24" value={perDay} onChange={(e) => setPerDay(e.target.value)} />
                  </div>
                  <Button
                    size="block"
                    disabled={store.isPending}
                    onClick={() => store.run({ batchId: batch.id, prepDate, portionsPerDay: toNumber(perDay) ?? 1 })}
                  >
                    {store.isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Snowflake className="size-4" aria-hidden />}
                    Store {portions} portions
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
