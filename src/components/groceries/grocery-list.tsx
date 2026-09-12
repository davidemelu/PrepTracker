'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronRight, Plus } from 'lucide-react';
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
import { DeleteButton } from '@/components/ui/delete-button';
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

/** "4 packs of 1 kg" — words, not "4 × 1 kg". */
export function packsLabel(item: Pick<GroceryItemRow, 'estimatedPackages' | 'packageSize' | 'packageUnit'>): string | null {
  if (item.estimatedPackages == null || !item.packageSize || !item.packageUnit) return null;
  const n = item.estimatedPackages;
  return `${n} pack${n === 1 ? '' : 's'} of ${formatAmount(item.packageSize, item.packageUnit)}`;
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
          <Select id="gi-category" value={category} onChange={(e) => setCategory(e.target.value as FoodCategoryKey)}>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gi-department">Department</Label>
          <Input id="gi-department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Produce" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="gi-notes">Notes</Label>
        <Textarea id="gi-notes" className="min-h-16" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {initial ? (
        <DeleteButton
          label="Remove from list"
          title={`Remove ${initial.name}?`}
          description="Only this week's list changes. Your plan and inventory are untouched."
          pending={remove.isPending}
          onConfirm={() => remove.run({ id: initial.id })}
          className="w-full"
        />
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
 * The planning view of a list. Each row says what to buy on one line; the
 * reasons (cooked-to-raw conversion, inventory already at home) and the edit
 * actions live in a sheet, so the list itself stays scannable.
 */
export function GroceryList({ groceryWeekId, items }: { groceryWeekId: string; items: GroceryItemRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<GroceryItemRow | null>(null);
  const [mode, setMode] = useState<'detail' | 'edit'>('detail');
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

  // Keep the sheet's item in sync after a refresh.
  const current = selected ? (items.find((i) => i.id === selected.id) ?? selected) : null;
  const missingYield = items.some((i) => i.rawQty != null && i.yieldPctUsed == null);

  const open = (item: GroceryItemRow) => {
    setSelected(item);
    setMode('detail');
  };
  const close = () => setSelected(null);

  return (
    <div className="space-y-4">
      {missingYield ? (
        <Link
          href="/prep/yields"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          <AlertTriangle className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">Some items have no cooking yield, so they show the cooked weight. Set yields.</span>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </Link>
      ) : null}

      {grouped.map((group) => (
        <section key={group.category} className="space-y-2">
          <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {CATEGORY_LABELS[group.category]}
          </h2>

          <Card className="divide-y divide-border">
            {group.items.map((item) => {
              const done = item.purchased || item.haveAlready;
              const packs = packsLabel(item);
              return (
                <div key={item.id} className="flex min-h-14 items-center gap-3 pl-3 pr-2">
                  <Checkbox
                    size="lg"
                    checked={item.purchased}
                    disabled={purchased.isPending}
                    onCheckedChange={(checked) => purchased.run({ id: item.id, value: checked === true })}
                    aria-label={`Mark ${item.name} as bought`}
                  />
                  <button type="button" onClick={() => open(item)} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={cn('font-medium leading-tight', done && 'text-muted-foreground line-through')}>{item.name}</span>
                        {item.haveAlready ? <Badge variant="secondary">Have it</Badge> : null}
                        {item.isAdHoc ? <Badge variant="outline">Added</Badge> : null}
                      </span>
                      <span className="tabular block text-sm text-muted-foreground">
                        Buy <span className="font-semibold text-foreground">{formatAmount(item.shoppingQty, item.shoppingUnit)}</span>
                        {packs ? ` · ${packs}` : ''}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </div>
              );
            })}
          </Card>
        </section>
      ))}

      <Button variant="outline" size="block" onClick={() => setAdding(true)}>
        <Plus className="size-4" />
        Add an item
      </Button>

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent title="Add an item" description="Anything not in your plan.">
          <ItemForm groceryWeekId={groceryWeekId} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={current !== null} onOpenChange={(o) => !o && close()}>
        <SheetContent title={current?.name ?? 'Item'} description={mode === 'edit' ? 'Edit this item.' : undefined}>
          {current && mode === 'detail' ? (
            <div className="space-y-4">
              <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                <div className="flex justify-between gap-3 px-3 py-2.5">
                  <dt className="text-muted-foreground">Buy</dt>
                  <dd className="tabular text-right font-semibold">
                    {formatAmount(current.shoppingQty, current.shoppingUnit)}
                    {packsLabel(current) ? <span className="block text-xs font-normal text-muted-foreground">{packsLabel(current)}</span> : null}
                  </dd>
                </div>
                {current.cookedQty != null ? (
                  <div className="flex justify-between gap-3 px-3 py-2.5">
                    <dt className="text-muted-foreground">Plan needs</dt>
                    <dd className="tabular text-right">
                      {formatAmount(current.cookedQty, current.requiredUnit)} cooked
                      {current.yieldPctUsed ? <span className="block text-xs text-muted-foreground">at {current.yieldPctUsed}% yield</span> : null}
                    </dd>
                  </div>
                ) : null}
                {current.inventoryQty ? (
                  <div className="flex justify-between gap-3 px-3 py-2.5">
                    <dt className="text-muted-foreground">Already at home</dt>
                    <dd className="tabular text-right">{formatAmount(current.inventoryQty, current.shoppingUnit)}</dd>
                  </div>
                ) : null}
              </dl>
              {current.inventoryNote ? <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">{current.inventoryNote}</p> : null}
              {current.notes ? <p className="text-sm">{current.notes}</p> : null}

              <div className="space-y-2">
                <Button
                  variant="outline"
                  size="block"
                  disabled={have.isPending}
                  onClick={() => have.run({ id: current.id, value: !current.haveAlready })}
                >
                  {current.haveAlready ? 'I need to buy this' : 'I already have this'}
                </Button>
                <Button variant="outline" size="block" onClick={() => setMode('edit')}>
                  Edit item
                </Button>
              </div>
            </div>
          ) : null}
          {current && mode === 'edit' ? (
            <ItemForm key={current.id} groceryWeekId={groceryWeekId} initial={current} onDone={close} onCancel={() => setMode('detail')} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
