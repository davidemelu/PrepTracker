'use client';

import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { CATEGORY_LABELS, CATEGORY_ORDER, type FoodCategoryKey } from '@/lib/domain/grocery';
import { formatAmount } from '@/lib/domain/units';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { FoodForm, type FoodFormValues } from './food-form';

export interface FoodRow {
  id: string;
  name: string;
  category: FoodCategoryKey;
  defaultUnit: string;
  department: string | null;
  bulkClass: string;
  storageDefault: string;
  packageSize: number | null;
  packageUnit: string | null;
  tracksYield: boolean;
  cookingYieldPct: number | null;
  nutritionBasisQty: number;
  nutritionBasisUnit: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  sodium: number | null;
  notes: string | null;
  active: boolean;
}

const toFormValues = (food: FoodRow): Partial<FoodFormValues> => ({
  id: food.id,
  name: food.name,
  category: food.category,
  defaultUnit: food.defaultUnit,
  department: food.department ?? '',
  bulkClass: food.bulkClass,
  storageDefault: food.storageDefault,
  packageSize: food.packageSize != null ? String(food.packageSize) : '',
  packageUnit: food.packageUnit ?? '',
  tracksYield: food.tracksYield,
  cookingYieldPct: food.cookingYieldPct != null ? String(food.cookingYieldPct) : '',
  nutritionBasisQty: String(food.nutritionBasisQty),
  nutritionBasisUnit: food.nutritionBasisUnit,
  calories: food.calories != null ? String(food.calories) : '',
  protein: food.protein != null ? String(food.protein) : '',
  carbs: food.carbs != null ? String(food.carbs) : '',
  fat: food.fat != null ? String(food.fat) : '',
  fibre: food.fibre != null ? String(food.fibre) : '',
  sodium: food.sodium != null ? String(food.sodium) : '',
  notes: food.notes ?? '',
  active: food.active,
});

export function FoodsManager({ foods }: { foods: FoodRow[] }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<FoodRow | null>(null);
  const [adding, setAdding] = useState(false);

  const departments = useMemo(
    () => [...new Set(foods.map((f) => f.department).filter((d): d is string => Boolean(d)))].sort(),
    [foods],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return foods;
    return foods.filter(
      (food) =>
        food.name.toLowerCase().includes(needle) ||
        (food.department ?? '').toLowerCase().includes(needle) ||
        CATEGORY_LABELS[food.category].toLowerCase().includes(needle),
    );
  }, [foods, query]);

  const grouped = useMemo(() => {
    const map = new Map<FoodCategoryKey, FoodRow[]>();
    for (const food of filtered) {
      const list = map.get(food.category) ?? [];
      list.push(food);
      map.set(food.category, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
      category,
      foods: map.get(category)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search foods"
            className="pl-9"
            type="search"
            aria-label="Search foods"
          />
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Food
        </Button>
      </div>

      {grouped.length === 0 ? (
        <EmptyState
          title={query ? 'No foods match that search' : 'No foods yet'}
          description={query ? undefined : 'Add the foods you eat so meals and groceries can use them.'}
        />
      ) : (
        grouped.map((group) => (
          <section key={group.category} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {CATEGORY_LABELS[group.category]}
            </h2>
            <Card className="divide-y divide-border">
              {group.foods.map((food) => (
                <button
                  key={food.id}
                  type="button"
                  onClick={() => setEditing(food)}
                  className="flex w-full items-center gap-3 p-3 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium leading-tight">{food.name}</span>
                      {!food.active ? <Badge variant="secondary">Inactive</Badge> : null}
                      {food.tracksYield && food.cookingYieldPct ? (
                        <Badge variant="outline">{food.cookingYieldPct}% yield</Badge>
                      ) : null}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {food.defaultUnit}
                      {food.department ? ` · ${food.department}` : ''}
                      {food.packageSize && food.packageUnit
                        ? ` · ${formatAmount(food.packageSize, food.packageUnit)} pack`
                        : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {food.calories != null ? (
                      <>
                        <span className="tabular block">{Math.round(food.calories)} kcal</span>
                        <span className="tabular block">
                          per {food.nutritionBasisQty} {food.nutritionBasisUnit}
                        </span>
                      </>
                    ) : (
                      <span>No nutrition</span>
                    )}
                  </span>
                </button>
              ))}
            </Card>
          </section>
        ))
      )}

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent title="New food">
          <FoodForm
            departments={departments}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <SheetContent title={editing?.name ?? 'Food'}>
          {editing ? (
            <FoodForm
              key={editing.id}
              initial={toFormValues(editing)}
              departments={departments}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
