'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, Search, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { saveGroceryItem, togglePurchased } from '@/lib/actions/groceries';
import { groupByDepartment, type FoodCategoryKey } from '@/lib/domain/grocery';
import { formatAmount } from '@/lib/domain/units';
import { UNIT_DEFINITIONS } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NumberInput } from '@/components/ui/input';
import { Label, Switch } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { GroceryItemRow } from './grocery-list';

/**
 * In-store mode.
 *
 * Deliberately sparse: full-width rows, a huge tick target, one number that
 * matters (how many left), and an undo. Nothing here should need two hands or
 * careful aim while pushing a trolley.
 */
export function ShoppingMode({
  groceryWeekId,
  items,
}: {
  groceryWeekId: string;
  items: GroceryItemRow[];
}) {
  const router = useRouter();
  const [hideDone, setHideDone] = useState(true);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [lastToggled, setLastToggled] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Optimistic so a tap registers instantly on a shop's poor signal.
  const [optimisticItems, applyOptimistic] = useOptimistic(
    items,
    (current, update: { id: string; purchased: boolean }) =>
      current.map((item) => (item.id === update.id ? { ...item, purchased: update.purchased } : item)),
  );

  const toggle = (item: GroceryItemRow, purchased: boolean) => {
    setLastToggled(purchased ? item.id : null);
    startTransition(async () => {
      applyOptimistic({ id: item.id, purchased });
      const result = await togglePurchased({ id: item.id, value: purchased });
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  };

  const active = useMemo(
    () => optimisticItems.filter((item) => !item.haveAlready),
    [optimisticItems],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return active.filter((item) => {
      if (hideDone && item.purchased) return false;
      if (!needle) return true;
      return (
        item.name.toLowerCase().includes(needle) ||
        (item.department ?? '').toLowerCase().includes(needle)
      );
    });
  }, [active, hideDone, query]);

  const groups = useMemo(() => groupByDepartment(filtered), [filtered]);
  const remaining = active.filter((item) => !item.purchased).length;
  const total = active.length;

  return (
    <div className="space-y-3">
      {/* Sticky control bar ------------------------------------------------ */}
      {/*
        Sticks to the very top (the page header on this route does not stick),
        so the offset never has to match the header's height, which changes
        with the safe-area inset in standalone mode on a phone.
      */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 space-y-2 border-b border-border bg-background/95 px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex-1" aria-live="polite">
            <p className="tabular text-2xl font-bold leading-none">{remaining}</p>
            <p className="text-xs text-muted-foreground">
              {remaining === 1 ? 'item' : 'items'} remaining · {total - remaining} in the trolley
            </p>
          </div>

          {lastToggled ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const item = items.find((i) => i.id === lastToggled);
                if (item) toggle(item, false);
              }}
            >
              <Undo2 className="size-4" />
              Undo
            </Button>
          ) : null}

          <Button variant="outline" size="icon" aria-label="Add an item" onClick={() => setAdding(true)}>
            <Plus className="size-5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the list"
              className="h-10 pl-9 pr-9"
              aria-label="Search the list"
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            Hide done
            <Switch checked={hideDone} onCheckedChange={setHideDone} aria-label="Hide items already bought" />
          </label>
        </div>
      </div>

      {/* Item rows --------------------------------------------------------- */}
      {groups.length === 0 ? (
        <Card className="p-8 text-center">
          <Check className="mx-auto size-8 text-success" />
          <p className="mt-2 font-medium">
            {query ? 'Nothing matches that search' : 'Everything is in the trolley'}
          </p>
          {!query ? (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setHideDone(false)}>
              Show what I bought
            </Button>
          ) : null}
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.department} className="space-y-1.5">
            <h2 className="px-1 text-sm font-semibold">{group.department}</h2>
            <Card className="divide-y divide-border overflow-hidden">
              {group.lines.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggle(item, !item.purchased)}
                  className={cn(
                    'flex w-full items-center gap-4 p-4 text-left transition-colors active:bg-accent',
                    item.purchased && 'bg-success/5',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-11 shrink-0 items-center justify-center rounded-xl border-2 transition-colors',
                      item.purchased
                        ? 'border-success bg-success text-success-foreground'
                        : 'border-input',
                    )}
                    aria-hidden
                  >
                    {item.purchased ? <Check className="size-6" strokeWidth={3} /> : null}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block text-base font-medium leading-tight',
                        item.purchased && 'text-muted-foreground line-through',
                      )}
                    >
                      {item.name}
                    </span>
                    <span className="tabular block text-sm text-muted-foreground">
                      {formatAmount(item.shoppingQty, item.shoppingUnit)}
                      {item.estimatedPackages != null && item.packageSize && item.packageUnit
                        ? ` · ${item.estimatedPackages} × ${formatAmount(item.packageSize, item.packageUnit)}`
                        : ''}
                    </span>
                  </span>
                </button>
              ))}
            </Card>
          </section>
        ))
      )}

      <AdHocSheet
        groceryWeekId={groceryWeekId}
        open={adding}
        onOpenChange={setAdding}
        onDone={() => {
          setAdding(false);
          router.refresh();
        }}
      />
    </div>
  );
}

function AdHocSheet({
  groceryWeekId,
  open,
  onOpenChange,
  onDone,
}: {
  groceryWeekId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('each');

  const save = useAction(saveGroceryItem, {
    onSuccess: () => {
      setName('');
      setQuantity('1');
      onDone();
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Add to the list" description="Something you spotted in the aisle.">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="adhoc-name">Item</Label>
            <Input id="adhoc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-qty">Quantity</Label>
              <NumberInput id="adhoc-qty" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-unit">Unit</Label>
              <Select id="adhoc-unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
            </div>
          </div>
          {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}
        </div>

        <SheetFooter>
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={save.isPending}
            onClick={() =>
              save.run({
                groceryWeekId,
                name,
                category: 'OTHER' as FoodCategoryKey,
                shoppingQty: quantity,
                shoppingUnit: unit,
              } as unknown as Parameters<typeof saveGroceryItem>[0])
            }
          >
            Add
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** Small local select so the ad hoc sheet stays self-contained. */
function Select({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLSelectElement>) => void;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {UNIT_DEFINITIONS.map((u) => (
        <option key={u.key} value={u.key}>
          {u.label}
        </option>
      ))}
    </select>
  );
}
