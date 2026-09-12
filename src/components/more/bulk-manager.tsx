'use client';

import { useState } from 'react';
import { PackageCheck, Snowflake, Sprout } from 'lucide-react';
import { setBulkClass } from '@/lib/actions/foods';
import { CATEGORY_LABELS, type FoodCategoryKey } from '@/lib/domain/grocery';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface BulkRow {
  id: string;
  name: string;
  category: FoodCategoryKey;
  bulkClass: 'EXCELLENT' | 'GOOD_IF_FROZEN' | 'BUY_FRESH' | 'NOT_CLASSIFIED';
}

const CLASSES = [
  {
    value: 'EXCELLENT' as const,
    title: 'Excellent bulk buys',
    hint: 'Shelf-stable or frozen, cheap per unit in quantity.',
    icon: PackageCheck,
    className: 'text-success',
  },
  {
    value: 'GOOD_IF_FROZEN' as const,
    title: 'Good bulk buys if frozen',
    hint: 'Worth buying in quantity as long as you have freezer space.',
    icon: Snowflake,
    className: 'text-primary',
  },
  {
    value: 'BUY_FRESH' as const,
    title: 'Generally buy fresh',
    hint: 'Spoils quickly, so buy what you will eat this week.',
    icon: Sprout,
    className: 'text-warning',
  },
  {
    value: 'NOT_CLASSIFIED' as const,
    title: 'Not classified',
    hint: 'Sort these into one of the groups above.',
    icon: PackageCheck,
    className: 'text-muted-foreground',
  },
];

/**
 * Bulk buying guidance. Every classification is just a value on the food, so
 * anything here can be re-sorted in two taps when your storage changes.
 */
export function BulkManager({ foods }: { foods: BulkRow[] }) {
  const [editing, setEditing] = useState<BulkRow | null>(null);

  const setClass = useAction(setBulkClass, {
    successToast: false,
    onSuccess: () => {
      setEditing(null);
    },
  });

  return (
    <div className="space-y-4">
      {CLASSES.map((group) => {
        const rows = foods.filter((f) => f.bulkClass === group.value);
        if (rows.length === 0) return null;
        const Icon = group.icon;

        return (
          <section key={group.value} className="space-y-2">
            <div className="px-1">
              <h2 className={cn('flex items-center gap-2 text-sm font-semibold', group.className)}>
                <Icon className="size-4" />
                {group.title}
              </h2>
              <p className="text-xs text-muted-foreground">{group.hint}</p>
            </div>

            <Card className="divide-y divide-border">
              {rows.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => setEditing(food)}
                  className="flex w-full min-h-12 items-center gap-3 px-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1 font-medium">{food.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {CATEGORY_LABELS[food.category]}
                  </span>
                </button>
              ))}
            </Card>
          </section>
        );
      })}

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <SheetContent
          title={editing?.name ?? 'Food'}
          description="How should this be bought?"
        >
          <div className="space-y-2">
            {CLASSES.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  disabled={setClass.isPending}
                  onClick={() => editing && setClass.run({ id: editing.id, bulkClass: option.value })}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                    editing?.bulkClass === option.value
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent',
                  )}
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', option.className)} />
                  <span className="min-w-0">
                    <span className="block font-medium leading-tight">{option.title}</span>
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <Button variant="outline" size="block" className="mt-4" onClick={() => setEditing(null)}>
            Close
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}
