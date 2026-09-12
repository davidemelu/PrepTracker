'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Boxes, Check, Scale, Snowflake } from 'lucide-react';
import { toast } from 'sonner';
import { storeBatchPortions, updatePrepBatch } from '@/lib/actions/prep';
import { planPortions } from '@/lib/domain/yield';
import { formatAmount } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
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

/**
 * One food being batch cooked, laid out as the steps you actually do:
 * weigh raw → cook → weigh cooked → see the real yield → portion → store.
 */
export function BatchCard({ batch, prepDate }: { batch: BatchRow; prepDate: string }) {
  const router = useRouter();
  const [raw, setRaw] = useState(batch.rawWeightG != null ? String(batch.rawWeightG) : '');
  const [cooked, setCooked] = useState(batch.cookedWeightG != null ? String(batch.cookedWeightG) : '');
  const [portionSize, setPortionSize] = useState(String(batch.portionSizeG));
  const [containers, setContainers] = useState(
    batch.containersPrepared != null ? String(batch.containersPrepared) : '',
  );

  const save = useAction(updatePrepBatch, {
    successToast: false,
    onSuccess: (data) => {
      router.refresh();
      if (data.measuredYieldPct != null) {
        toast.success(
          `Actual yield ${data.measuredYieldPct}% · ${data.portions} portions of ${portionSize} g` +
            (data.leftoverG ? ` (${data.leftoverG} g left over)` : ''),
        );
      } else {
        toast.success('Batch saved.');
      }
    },
    onNeedsConfirmation: (message) => {
      toast.warning(message, {
        action: { label: 'Save anyway', onClick: () => submit(true) },
      });
    },
  });

  const store = useAction(storeBatchPortions, { onSuccess: () => router.refresh() });

  const submit = (confirmYield = false) =>
    save.run({
      id: batch.id,
      rawWeightG: toNumber(raw),
      cookedWeightG: toNumber(cooked),
      portionSizeG: toNumber(portionSize),
      containersPrepared: toNumber(containers),
      confirmYield,
    } as unknown as Parameters<typeof updatePrepBatch>[0]);

  // Live preview while typing, before anything is saved.
  const cookedNow = toNumber(cooked);
  const sizeNow = toNumber(portionSize) ?? batch.portionSizeG;
  const preview =
    cookedNow != null && sizeNow > 0
      ? planPortions(cookedNow, sizeNow, batch.portionsPlanned ?? undefined)
      : null;

  const rawNow = toNumber(raw);
  const liveYield =
    rawNow != null && rawNow > 0 && cookedNow != null ? Math.round((cookedNow / rawNow) * 1000) / 10 : null;

  const suggestedRaw =
    batch.targetCookedG != null && batch.expectedYieldPct
      ? Math.round(batch.targetCookedG / (batch.expectedYieldPct / 100))
      : null;

  const done = batch.cookedWeightG != null;

  return (
    <Card className={cn('overflow-hidden', done && 'border-success/40')}>
      <div className="flex items-start justify-between gap-2 p-4 pb-2">
        <div className="min-w-0">
          <h3 className="font-semibold leading-tight">{batch.foodName}</h3>
          <p className="text-sm text-muted-foreground">
            Need {batch.targetCookedG != null ? formatAmount(batch.targetCookedG, 'g') : '—'} cooked
            {batch.portionsPlanned ? ` · ${batch.portionsPlanned} × ${batch.portionSizeG} g` : ''}
          </p>
        </div>
        {done ? (
          <Badge variant="success">
            <Check className="size-3" />
            Cooked
          </Badge>
        ) : null}
      </div>

      <div className="space-y-3 px-4 pb-4">
        {suggestedRaw && !done ? (
          <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
            Start with roughly <span className="font-medium text-foreground">{suggestedRaw} g raw</span> at
            your current {batch.expectedYieldPct}% yield.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`raw-${batch.id}`}>
              <Scale className="mr-1 inline size-3.5" />
              Raw (g)
            </Label>
            <NumberInput
              id={`raw-${batch.id}`}
              aria-label={`Raw weight in grams for ${batch.foodName}`}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={suggestedRaw ? String(suggestedRaw) : '0'}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`cooked-${batch.id}`}>Cooked (g)</Label>
            <NumberInput
              id={`cooked-${batch.id}`}
              aria-label={`Cooked weight in grams for ${batch.foodName}`}
              value={cooked}
              onChange={(e) => setCooked(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        {liveYield != null ? (
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm">
              Actual yield <span className="tabular text-base font-semibold">{liveYield}%</span>
              {batch.expectedYieldPct ? (
                <span className="text-muted-foreground"> · expected {batch.expectedYieldPct}%</span>
              ) : null}
            </p>
            {preview ? (
              <p className="mt-1 text-sm">
                <span className="tabular text-base font-semibold">{preview.portions}</span> portions of{' '}
                {sizeNow} g
                {preview.leftoverG > 0 ? (
                  <span className="text-muted-foreground"> · {preview.leftoverG} g left over</span>
                ) : null}
                {preview.shortfallPortions > 0 ? (
                  <span className="block text-warning">
                    {preview.shortfallPortions} portion{preview.shortfallPortions === 1 ? '' : 's'} short of
                    the {batch.portionsPlanned} you planned ({preview.shortfallG} g).
                  </span>
                ) : null}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Saving this updates the yield used for future shopping lists.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`size-${batch.id}`}>Portion (g)</Label>
            <NumberInput
              id={`size-${batch.id}`}
              aria-label={`Portion size in grams for ${batch.foodName}`}
              value={portionSize}
              onChange={(e) => setPortionSize(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`containers-${batch.id}`}>
              <Boxes className="mr-1 inline size-3.5" />
              Containers
            </Label>
            <NumberInput
              id={`containers-${batch.id}`}
              aria-label={`Containers prepared for ${batch.foodName}`}
              value={containers}
              onChange={(e) => setContainers(e.target.value)}
              placeholder={preview ? String(preview.portions) : '0'}
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            className="flex-1"
            aria-label={`Save the ${batch.foodName} batch`}
            disabled={save.isPending}
            onClick={() => submit()}
          >
            Save batch
          </Button>
          {done ? (
            <Button
              variant="outline"
              className="flex-1"
              disabled={store.isPending}
              onClick={() => store.run({ batchId: batch.id, prepDate, portionsPerDay: 1 })}
            >
              <Snowflake className="size-4" />
              {batch.storedPortions > 0 ? 'Store again' : 'Store'}
            </Button>
          ) : null}
        </div>

        {batch.storedPortions > 0 ? (
          <p className="text-xs text-muted-foreground">
            {batch.storedPortions} portion{batch.storedPortions === 1 ? '' : 's'} already assigned to the
            fridge or freezer.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
