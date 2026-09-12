'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Info, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  deleteGroceryItem,
  saveGroceryItem,
  toggleHaveAlready,
  togglePurchased,
} from '@/lib/actions/groceries';
import { CATEGORY_LABELS, CATEGORY_ORDER, type FoodCategoryKey } from '@/lib/domain/grocery';
import { formatAmount } from '@/lib/domain/units';
import { UNIT_DEFINITIONS } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NumberInput, Textarea } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface GroceryItemRow {
  id: string;
  name: string;
  category: FoodCategoryKey;
  department: string | null;
  requiredQty: number;
  requiredUnit: string;
  shoppingQty: number;
  shoppingUnit: string;
  cookedQty: number | null;
  rawQty: number | null;
  yieldPctUsed: number | null;
  inventoryQty: number | null;
  inventoryNote: string | null;
  estimatedPackages: number | null;
  packageSize: number | null;
  packageUnit: string | null;
  haveAlready: boolean;
  purchased: boolean;
  isAdHoc: boolean;
  notes: string | null;
}

function ItemForm({
  groceryWeekId,
  initial,
  onDone,
  onCancel,
}: {
  groceryWeekId: string;
  initial?: GroceryItemRow;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState<FoodCategoryKey>(initial?.category ?? 'OTHER');
  const [department, setDepartment] = useState(initial?.department ?? '');
  const [quantity, setQuantity] = useState(String(initial?.shoppingQty ?? ''));
  const [unit, setUnit] = useState(initial?.shoppingUnit ?? 'each');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  const finish = () => {
    router.refresh();
    onDone();
  };

  const save = useAction(saveGroceryItem, { onSuccess: finish });
  const remove = useAction(deleteGroceryItem, { onSuccess: finish });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="gi-name">Item</Label>
        <Input id="gi-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gi-qty">Quantity</Label>
          <NumberInput id="gi-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gi-unit">Unit</Label>
          <Select id="gi-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNIT_DEFINITIONS.map((u) => (
              <option key={u.key} value={u.key}>
                {u.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gi-category">Category</Label>
          <Select
            id="gi-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as FoodCategoryKey)}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gi-department">Department</Label>
          <Input
            id="gi-department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="Produce"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gi-notes">Notes</Label>
        <Textarea
          id="gi-notes"
          className="min-h-16"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {initial ? (
        <Button
          variant="ghost"
          className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={remove.isPending}
          onClick={() => remove.run({ id: initial.id })}
        >
          <Trash2 className="size-4" />
          Remove from list
        </Button>
      ) : null}

      {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}

      <SheetFooter>
        <Button variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={save.isPending}
          onClick={() =>
            save.run({
              id: initial?.id,
              groceryWeekId,
              name,
              category,
              department,
              shoppingQty: quantity,
              shoppingUnit: unit,
              notes,
            } as unknown as Parameters<typeof saveGroceryItem>[0])
          }
        >
          Save
        </Button>
      </SheetFooter>
    </div>
  );
}

/**
 * The planning view of a list: shows what the plan needs, what to buy, and why
 * the two differ (cooked-to-raw conversion, inventory already at home).
 */
export function GroceryList({
  groceryWeekId,
  items,
}: {
  groceryWeekId: string;
  items: GroceryItemRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<GroceryItemRow | null>(null);
  const [adding, setAdding] = useState(false);

  const purchased = useAction(togglePurchased, { successToast: false, onSuccess: () => router.refresh() });
  const have = useAction(toggleHaveAlready, { successToast: false, onSuccess: () => router.refresh() });

  const grouped = useMemo(() => {
    const map = new Map<FoodCategoryKey, GroceryItemRow[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((category) => ({
      category,
      items: map.get(category)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }, [items]);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add item
        </Button>
      </div>

      {grouped.map((group) => (
        <section key={group.category} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[group.category]}
          </h2>

          <Card className="divide-y divide-border">
            {group.items.map((item) => {
              const done = item.purchased || item.haveAlready;
              return (
                <div key={item.id} className={cn('p-3', done && 'opacity-60')}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      size="lg"
                      className="mt-0.5"
                      checked={item.purchased}
                      disabled={purchased.isPending}
                      onCheckedChange={(checked) =>
                        purchased.run({ id: item.id, value: checked === true })
                      }
                      aria-label={`Mark ${item.name} as bought`}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('font-medium leading-tight', done && 'line-through')}>
                          {item.name}
                        </span>
                        {item.isAdHoc ? <Badge variant="outline">Added</Badge> : null}
                        {item.haveAlready ? <Badge variant="secondary">Have it</Badge> : null}
                      </div>

                      <p className="tabular text-sm">
                        Buy{' '}
                        <span className="font-semibold">
                          {formatAmount(item.shoppingQty, item.shoppingUnit)}
                        </span>
                        {item.estimatedPackages != null && item.packageSize && item.packageUnit ? (
                          <span className="text-muted-foreground">
                            {' '}
                            · {item.estimatedPackages} ×{' '}
                            {formatAmount(item.packageSize, item.packageUnit)} pack
                            {item.estimatedPackages === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </p>

                      {item.cookedQty != null ? (
                        <p className="text-xs text-muted-foreground">
                          Plan needs {formatAmount(item.cookedQty, item.requiredUnit)} cooked
                          {item.yieldPctUsed ? ` · ${item.yieldPctUsed}% yield` : ''}
                        </p>
                      ) : null}

                      {item.inventoryQty ? (
                        <p className="text-xs text-muted-foreground">
                          {formatAmount(item.inventoryQty, item.shoppingUnit)} already in your inventory
                        </p>
                      ) : null}

                      {item.inventoryNote ? (
                        <p className="mt-1 flex items-start gap-1.5 rounded-md bg-muted p-1.5 text-xs text-muted-foreground">
                          <Info className="mt-0.5 size-3 shrink-0" />
                          {item.inventoryNote}
                        </p>
                      ) : null}

                      {item.notes ? (
                        <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>
                      ) : null}

                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          disabled={have.isPending}
                          onClick={() => have.run({ id: item.id, value: !item.haveAlready })}
                        >
                          <PackagePlus className="size-3.5" />
                          {item.haveAlready ? 'Need to buy' : 'Already have'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => setEditing(item)}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      ))}

      {items.some((i) => i.rawQty != null && i.yieldPctUsed == null) ? (
        <p className="flex items-start gap-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          Some cooked-weight items have no cooking yield set, so the amount shown is the cooked weight
          rather than what to buy. Set a yield under Prep → Yields.
        </p>
      ) : null}

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent title="Add an item" description="Anything not in your plan.">
          <ItemForm
            groceryWeekId={groceryWeekId}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <SheetContent title={editing?.name ?? 'Item'}>
          {editing ? (
            <ItemForm
              key={editing.id}
              groceryWeekId={groceryWeekId}
              initial={editing}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
