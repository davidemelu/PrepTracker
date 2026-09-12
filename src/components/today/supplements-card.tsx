'use client';

import { CheckCheck, Pill } from 'lucide-react';
import {
  completeAllSupplements,
  completeSupplement,
  undoSupplement,
} from '@/lib/actions/supplements';
import { formatDose, SUPPLEMENT_TIMING_LABELS, type SupplementTimingKey } from '@/lib/domain/materialise';
import { formatTime12h } from '@/lib/domain/time';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/primitives';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import type { DaySupplementView } from '@/lib/queries/day';

/**
 * Supplements grouped by when you take them. Each row is a large checkbox, so
 * the whole morning stack is four taps.
 */
export function SupplementsCard({
  dailyPlanId,
  supplements,
}: {
  dailyPlanId: string;
  supplements: DaySupplementView[];
}) {
  const complete = useAction(completeSupplement, { successToast: false });
  const undo = useAction(undoSupplement, { successToast: false });
  const completeAll = useAction(completeAllSupplements);

  const remaining = supplements.filter((s) => s.status !== 'COMPLETED').length;

  const groups = supplements.reduce<Map<string, DaySupplementView[]>>((map, supplement) => {
    const key = supplement.timingLabel || SUPPLEMENT_TIMING_LABELS[supplement.timing as SupplementTimingKey];
    const list = map.get(key) ?? [];
    list.push(supplement);
    map.set(key, list);
    return map;
  }, new Map());

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Pill className="size-4 text-primary" />
          Supplements
          <span className="tabular text-sm font-normal text-muted-foreground">
            {supplements.length - remaining}/{supplements.length}
          </span>
        </CardTitle>
        {remaining > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => completeAll.run({ dailyPlanId })}
            disabled={completeAll.isPending}
          >
            <CheckCheck className="size-4" />
            All
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-3">
        {supplements.length === 0 ? (
          <EmptyState
            icon={Pill}
            title="No supplements for today"
            description="Add them under Plan → Supplements."
          />
        ) : (
          [...groups.entries()].map(([label, items]) => (
            <div key={label}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {label}
              </p>
              <ul className="space-y-1">
                {items.map((supplement) => {
                  const done = supplement.status === 'COMPLETED';
                  return (
                    <li key={supplement.id}>
                      <label
                        className={cn(
                          'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 transition-colors',
                          done && 'border-success/40 bg-success/5',
                        )}
                      >
                        <Checkbox
                          size="lg"
                          checked={done}
                          disabled={complete.isPending || undo.isPending}
                          onCheckedChange={(checked) =>
                            checked
                              ? complete.run({ dailySupplementId: supplement.id })
                              : undo.run({ dailySupplementId: supplement.id })
                          }
                          aria-label={`${supplement.name}, ${formatDose(supplement)}`}
                        />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate font-medium', done && 'text-muted-foreground line-through')}>
                            {supplement.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatDose(supplement)}
                            {supplement.timeOfDay ? ` · ${formatTime12h(supplement.timeOfDay)}` : ''}
                          </span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
