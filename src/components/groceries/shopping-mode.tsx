'use client';

import { useMemo, useOptimistic, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronRight, Plus, Search, Undo2, X } from 'lucide-react';
import { toast } from 'sonner';
import { saveGroceryItem, togglePurchased } from '@/lib/actions/groceries';
import { groupByDepartment, type FoodCategoryKey } from '@/lib/domain/grocery';
import { formatAmount } from '@/lib/domain/units';
import { UNIT_DEFINITIONS } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NumberInput } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { packsLabel, type GroceryItemRow } from './grocery-list';

/**
 * In-store mode.
 *
 * Deliberately sparse: full-width rows, a huge tick target, one number that
 * matters (how many left), and an undo. Ticked items drop into a collapsed
 * "In the trolley" group at the bottom so the list only ever shows what is
 * still to find.
 */
export function ShoppingMode({ groceryWeekId, items }: { groceryWeekId: string; items: GroceryItemRow[] }) {
  const router = useRouter();
  const [view, setView] = useState<'remaining' | 'all'>('remaining');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const [trolleyOpen, setTrolleyOpen] = useState(false);
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

  const active = useMemo(() => optimisticItems.filter((item) => !item.haveAlready), [optimisticItems]);
  const needle = query.trim().toLowerCase();
  const matches = (item: GroceryItemRow) =>
    !needle || item.name.toLowerCase().includes(needle) || (item.department ?? '').toLowerCase().includes(needle);

  const remainingItems = useMemo(() => active.filter((i) => !i.purchased && matches(i)), [active, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const trolleyItems = useMemo(() => active.filter((i) => i.purchased && matches(i)), [active, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const listed = view === 'all' ? active.filter(matches) : remainingItems;

  const groups = useMemo(() => groupByDepartment(listed), [listed]);
  const remaining = active.filter((item) => !item.purchased).length;
  const total = active.length;

  const row = (item: GroceryItemRow) => {
    const packs = packsLabel(item);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => toggle(item, !item.purchased)}
        className={cn('flex min-h-16 w-full items-center gap-4 px-4 py-2 text-left transition-colors active:bg-accent', item.purchased && 'bg-success/5')}
      >
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
            item.purchased ? 'border-success bg-success text-success-foreground' : 'border-input',
          )}
          aria-hidden
        >
          {item.purchased ? <Check className="size-6" strokeWidth={3} /> : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-base font-medium leading-tight', item.purchased && 'text-muted-foreground line-through')}>{item.name}</span>
          <span className="tabular block text-sm text-muted-foreground">
            {formatAmount(item.shoppingQty, item.shoppingUnit)}
            {packs ? ` · ${packs}` : ''}
          </span>
        </span>
        {item.purchased && lastToggled === item.id ? (
          <span className="flex items-center gap-1 text-sm font-semibold text-primary">
            <Undo2 className="size-4" aria-hidden />
            Undo
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="space-y-3">
      {/*
        Sticks to the very top (the page header on this route does not stick),
        so the offset never has to match the header's height, which changes
        with the safe-area inset in standalone mode on a phone.
      */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 space-y-2 border-b border-border bg-background/95 px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-sm">
        {/*
          The controls drop onto their own row below 360px. Side by side they
          need 272px — a 160px view toggle, two 44px buttons and the gaps — and
          a 320px phone only offers 288px of content box, which left the count
          of what is still to find, the one number this screen exists for,
          squeezed into about 16px and reading "12 / items / remai…".
        */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-full min-[360px]:basis-auto" aria-live="polite">
            <p className="tabular text-2xl font-bold leading-none">{remaining}</p>
            <p className="text-xs text-muted-foreground">
              {remaining === 1 ? 'item' : 'items'} remaining · {total - remaining} in the trolley
            </p>
          </div>
          <div className="flex w-full items-center gap-2 min-[360px]:w-auto">
            <SegmentedControl
              aria-label="Show"
              size="sm"
              className="min-w-0 flex-1 min-[360px]:w-40 min-[360px]:flex-none"
              value={view}
              onChange={(v) => setView(v as typeof view)}
              options={[
                { value: 'remaining', label: 'Remaining' },
                { value: 'all', label: 'All' },
              ]}
            />
            <Button variant="outline" size="icon" aria-label="Search the list" aria-pressed={searching} onClick={() => setSearching((s) => !s)}>
              <Search className="size-5" />
            </Button>
            <Button variant="outline" size="icon" aria-label="Add an item" onClick={() => setAdding(true)}>
              <Plus className="size-5" />
            </Button>
          </div>
        </div>

        {searching ? (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the list"
              className="h-11 pl-9 pr-9"
              aria-label="Search the list"
              autoFocus
            />
            {query ? (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute right-0 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <Card className="p-8 text-center">
          <Check className="mx-auto size-8 text-success" aria-hidden />
          <p className="mt-2 font-medium">{needle ? 'Nothing matches that search' : 'Everything is in the trolley'}</p>
        </Card>
      ) : (
        groups.map((group) => (
          <section key={group.department} className="space-y-1.5">
            <h2 className="px-1 text-sm font-semibold">{group.department}</h2>
            <Card className="divide-y divide-border overflow-hidden">{group.lines.map(row)}</Card>
          </section>
        ))
      )}

      {view === 'remaining' && trolleyItems.length > 0 ? (
        <section className="space-y-1.5">
          <button
            type="button"
            aria-expanded={trolleyOpen}
            onClick={() => setTrolleyOpen((o) => !o)}
            className="flex min-h-11 w-full items-center gap-2 px-1 text-sm font-semibold text-muted-foreground"
          >
            <span className="flex-1 text-left">In the trolley · {trolleyItems.length}</span>
            {trolleyOpen ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
          </button>
          {trolleyOpen ? <Card className="divide-y divide-border overflow-hidden">{trolleyItems.map(row)}</Card> : null}
        </section>
      ) : null}

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
              <select
                id="adhoc-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {UNIT_DEFINITIONS.map((u) => (
                  <option key={u.key} value={u.key}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* role="alert" so a failure inside a sheet is spoken, not just drawn. */}
          {save.error ? <p role="alert" className="text-sm text-destructive">{save.error}</p> : null}
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
