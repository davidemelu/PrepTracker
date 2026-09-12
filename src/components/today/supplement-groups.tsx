'use client';

import { useOptimistic, useState, useTransition } from 'react';
import { Check, ChevronDown, ChevronRight, Pill } from 'lucide-react';
import { toast } from 'sonner';
import { callAction } from '@/lib/hooks/use-action';
import { completeSupplement, completeSupplements, undoSupplement } from '@/lib/actions/supplements';
import { formatDose } from '@/lib/domain/materialise';
import { formatTime12h } from '@/lib/domain/time';
import { Checkbox } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { DaySupplementView } from '@/lib/queries/day';

interface Group {
  label: string;
  items: DaySupplementView[];
  remaining: number;
}

function groupByTiming(supplements: DaySupplementView[]): Group[] {
  const map = new Map<string, DaySupplementView[]>();
  for (const s of supplements) {
    const list = map.get(s.timingLabel) ?? [];
    list.push(s);
    map.set(s.timingLabel, list);
  }
  return [...map.entries()].map(([label, items]) => ({
    label,
    items,
    remaining: items.filter((i) => i.status !== 'COMPLETED').length,
  }));
}

/**
 * Supplements grouped by when you take them. Each group is one row until it is
 * opened; the first group with something left opens by itself. Ticks are
 * optimistic and silent: the row is the feedback.
 */
export function SupplementGroups({ supplements }: { supplements: DaySupplementView[] }) {
  const [, startTransition] = useTransition();
  const [optimistic, applyOptimistic] = useOptimistic(
    supplements,
    (current, update: { ids: string[]; status: 'COMPLETED' | 'PENDING' }) =>
      current.map((s) => (update.ids.includes(s.id) ? { ...s, status: update.status } : s)),
  );

  const groups = groupByTiming(optimistic);
  const total = optimistic.length;
  const taken = optimistic.filter((s) => s.status === 'COMPLETED').length;

  const defaultOpen = groups.find((g) => g.remaining > 0)?.label ?? null;
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const isOpen = (label: string) => toggled[label] ?? label === defaultOpen;

  const setStatus = (ids: string[], status: 'COMPLETED' | 'PENDING') => {
    startTransition(async () => {
      applyOptimistic({ ids, status });
      const result = await callAction(() =>
        status === 'COMPLETED'
          ? ids.length === 1
            ? completeSupplement({ dailySupplementId: ids[0]! })
            : completeSupplements({ dailySupplementIds: ids })
          : undoSupplement({ dailySupplementId: ids[0]! }),
      );
      // The optimistic tick is discarded when the transition ends, so the row
      // returns to what the server last said and the toast explains why.
      if (!result.ok) toast.error(result.error);
    });
  };

  if (total === 0) return null;

  return (
    <section className="space-y-2" aria-labelledby="supplements-heading">
      <div className="flex items-center justify-between px-1">
        <h2 id="supplements-heading" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Supplements
        </h2>
        <span className="tabular text-xs font-medium text-muted-foreground">
          {taken} of {total}
        </span>
      </div>

      <div className="divide-y divide-border rounded-xl border border-border bg-card shadow-sm">
        {groups.map((group) => {
          const open = isOpen(group.label);
          const done = group.remaining === 0;
          const pendingIds = group.items.filter((i) => i.status !== 'COMPLETED').map((i) => i.id);
          return (
            <div key={group.label}>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setToggled((prev) => ({ ...prev, [group.label]: !open }))}
                  className="flex min-h-12 flex-1 items-center gap-3 px-4 text-left"
                >
                  <Pill className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="flex-1 text-[15px] font-semibold">{group.label}</span>
                  {done ? (
                    <span className="flex items-center gap-1 text-xs font-semibold text-success">
                      All taken <Check className="size-3.5" strokeWidth={3} aria-hidden />
                    </span>
                  ) : (
                    <span className="tabular text-xs text-muted-foreground">
                      {group.remaining} left
                    </span>
                  )}
                  {open ? (
                    <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                  )}
                </button>
                {open && !done && pendingIds.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => setStatus(pendingIds, 'COMPLETED')}
                    className="mr-2 h-11 shrink-0 px-2 text-xs font-semibold text-primary"
                  >
                    Take all
                  </button>
                ) : null}
              </div>

              {open ? (
                <ul className="pb-1">
                  {group.items.map((supplement) => {
                    const taken = supplement.status === 'COMPLETED';
                    return (
                      <li key={supplement.id}>
                        <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-1.5">
                          <Checkbox
                            size="lg"
                            checked={taken}
                            onCheckedChange={(checked) =>
                              setStatus([supplement.id], checked ? 'COMPLETED' : 'PENDING')
                            }
                            aria-label={`${supplement.name}, ${formatDose(supplement)}`}
                          />
                          <span className="min-w-0 flex-1">
                            <span className={cn('block truncate text-[15px] font-medium', taken && 'text-muted-foreground')}>
                              {supplement.name}
                            </span>
                            <span className="tabular block text-xs text-muted-foreground">
                              {formatDose(supplement)}
                              {supplement.timeOfDay ? ` · ${formatTime12h(supplement.timeOfDay)}` : ''}
                            </span>
                          </span>
                          {taken ? (
                            <span className="text-xs font-medium text-success">Taken</span>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
