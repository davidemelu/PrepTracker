'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { setCookingYield } from '@/lib/actions/prep';
import { cookedToRaw } from '@/lib/domain/yield';
import { formatAmount, round } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { FieldError } from '@/components/ui/field-error';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { NumberInput } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';

export interface YieldRow {
  foodId: string;
  name: string;
  currentYieldPct: number | null;
  measurements: Array<{
    id: string;
    yieldPct: number;
    source: string;
    rawWeightG: number | null;
    cookedWeightG: number | null;
    recordedAt: string;
  }>;
}

/**
 * Cooking yields, with the measurement history behind each one.
 *
 * The history matters: it shows whether a yield is a seeded guess or something
 * your own kitchen has actually produced, several times.
 */
export function YieldsManager({ rows }: { rows: YieldRow[] }) {
  const [editing, setEditing] = useState<YieldRow | null>(null);
  const [value, setValue] = useState('');

  const save = useAction(setCookingYield, {
    onSuccess: () => {
      setEditing(null);
    },
    onNeedsConfirmation: (message) => {
      toast.warning(message, {
        action: {
          label: 'Save anyway',
          onClick: () =>
            editing &&
            save.run({
              foodId: editing.foodId,
              yieldPct: Number(value.replace(',', '.')),
              confirmYield: true,
            } as unknown as Parameters<typeof setCookingYield>[0]),
        },
      });
    },
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No foods track a cooking yield"
        description="Turn on 'Track a cooking yield' for a food under Plan → Foods to convert its cooked weights into raw amounts to buy."
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
        Raw amount needed = cooked amount ÷ yield. Every batch you weigh on prep day updates these, so
        shopping lists get more accurate over time.
      </p>

      {rows.map((row) => {
        const measured = row.measurements.filter((m) => m.source === 'MEASURED');
        const example =
          row.currentYieldPct && row.currentYieldPct > 0
            ? round(cookedToRaw(1000, row.currentYieldPct), 0)
            : null;

        return (
          <Card key={row.foodId} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-semibold leading-tight">{row.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {row.currentYieldPct != null ? (
                    <>
                      <span className="tabular font-medium text-foreground">{row.currentYieldPct}%</span>{' '}
                      yield
                      {example ? ` · 1 kg cooked needs ${formatAmount(example, 'g')} raw` : ''}
                    </>
                  ) : (
                    'No yield set'
                  )}
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditing(row);
                  setValue(row.currentYieldPct != null ? String(row.currentYieldPct) : '');
                }}
              >
                Edit
              </Button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {measured.length > 0 ? (
                <Badge variant="success">
                  {measured.length} measured batch{measured.length === 1 ? '' : 'es'}
                </Badge>
              ) : (
                <Badge variant="secondary">Starting estimate</Badge>
              )}
            </div>

            {measured.length > 0 ? (
              <details className="mt-2 border-t border-border pt-2">
                <summary className="cursor-pointer list-none text-xs text-muted-foreground">
                  Measurement history
                </summary>
                <ul className="mt-1.5 space-y-1">
                  {measured.slice(0, 8).map((m) => (
                    <li key={m.id} className="flex justify-between gap-2 text-xs text-muted-foreground">
                      <span className="tabular">
                        {m.rawWeightG != null && m.cookedWeightG != null
                          ? `${m.rawWeightG} g → ${m.cookedWeightG} g`
                          : 'Recorded'}
                      </span>
                      <span className="tabular font-medium text-foreground">{m.yieldPct}%</span>
                      <span className="tabular">{m.recordedAt}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Card>
        );
      })}

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <SheetContent
          title={editing ? `${editing.name} yield` : 'Cooking yield'}
          description="Cooked weight as a percentage of raw weight."
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="yield-value">Yield (%)</Label>
              <NumberInput
                id="yield-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Meat is typically 75–80%. Rice, oats and pasta gain water and sit well above 100%.
            </p>
            {save.error ? <FieldError>{save.error}</FieldError> : null}
          </div>

          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={save.isPending || !editing}
              onClick={() =>
                editing &&
                save.run({
                  foodId: editing.foodId,
                  yieldPct: Number(value.replace(',', '.')),
                } as unknown as Parameters<typeof setCookingYield>[0])
              }
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
