'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Package, Plus, Search } from 'lucide-react';
import {
  adjustInventoryQuantity,
  deleteInventoryItem,
  saveInventoryItem,
} from '@/lib/actions/inventory';
import { formatAmount } from '@/lib/domain/units';
import { UNIT_DEFINITIONS } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, NumberInput, Textarea } from '@/components/ui/input';
import { Label, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface InventoryRow {
  id: string;
  foodId: string | null;
  name: string;
  quantity: number;
  unit: string;
  location: 'PANTRY' | 'FRIDGE' | 'FREEZER';
  lowStockThreshold: number | null;
  expiresOn: string | null;
  notes: string | null;
}

const LOCATION_LABELS = {
  PANTRY: 'Pantry',
  FRIDGE: 'Refrigerator',
  FREEZER: 'Freezer',
} as const;

function ItemForm({
  initial,
  foods,
  onDone,
  onCancel,
}: {
  initial?: InventoryRow;
  foods: Array<{ id: string; name: string; defaultUnit: string }>;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    foodId: initial?.foodId ?? '',
    name: initial?.name ?? '',
    quantity: String(initial?.quantity ?? 0),
    unit: initial?.unit ?? 'g',
    location: initial?.location ?? ('PANTRY' as const),
    lowStockThreshold: initial?.lowStockThreshold != null ? String(initial.lowStockThreshold) : '',
    expiresOn: initial?.expiresOn ?? '',
    notes: initial?.notes ?? '',
  });

  const finish = () => {
    router.refresh();
    onDone();
  };

  const save = useAction(saveInventoryItem, { onSuccess: finish });
  const remove = useAction(deleteInventoryItem, { onSuccess: finish });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const chooseFood = (foodId: string) => {
    const food = foods.find((f) => f.id === foodId);
    setValues((prev) => ({
      ...prev,
      foodId,
      name: food && !prev.name ? food.name : prev.name,
      unit: food ? food.defaultUnit : prev.unit,
    }));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="inv-food">Linked food</Label>
        <Select id="inv-food" value={values.foodId} onChange={(e) => chooseFood(e.target.value)}>
          <option value="">Not linked</option>
          {foods.map((food) => (
            <option key={food.id} value={food.id}>
              {food.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Linking lets grocery lists subtract this stock automatically.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-name">Name</Label>
        <Input id="inv-name" value={values.name} onChange={(e) => set('name', e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="inv-qty">Quantity</Label>
          <NumberInput
            id="inv-qty"
            value={values.quantity}
            onChange={(e) => set('quantity', e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-unit">Unit</Label>
          <Select id="inv-unit" value={values.unit} onChange={(e) => set('unit', e.target.value)}>
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
          <Label htmlFor="inv-location">Location</Label>
          <Select
            id="inv-location"
            value={values.location}
            onChange={(e) => set('location', e.target.value as typeof values.location)}
          >
            {Object.entries(LOCATION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inv-threshold">Low stock at</Label>
          <NumberInput
            id="inv-threshold"
            value={values.lowStockThreshold}
            onChange={(e) => set('lowStockThreshold', e.target.value)}
            placeholder="Optional"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-expires">Use by (optional)</Label>
        <input
          id="inv-expires"
          type="date"
          value={values.expiresOn}
          onChange={(e) => set('expiresOn', e.target.value)}
          className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="inv-notes">Notes</Label>
        <Textarea
          id="inv-notes"
          className="min-h-16"
          value={values.notes}
          onChange={(e) => set('notes', e.target.value)}
        />
      </div>

      {initial ? (
        <DeleteButton
          label="Remove from inventory"
          title={`Remove ${initial.name}?`}
          description="Grocery lists stop subtracting it. Nothing else changes."
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
              ...values,
              foodId: values.foodId || undefined,
              lowStockThreshold: values.lowStockThreshold || undefined,
              expiresOn: values.expiresOn || undefined,
            } as unknown as Parameters<typeof saveInventoryItem>[0])
          }
        >
          Save
        </Button>
      </SheetFooter>
    </div>
  );
}

export function InventoryManager({
  items,
  foods,
}: {
  items: InventoryRow[];
  foods: Array<{ id: string; name: string; defaultUnit: string }>;
}) {
  const router = useRouter();
  const [location, setLocation] = useState<'ALL' | InventoryRow['location']>('ALL');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<InventoryRow | null>(null);
  const [adding, setAdding] = useState(false);

  const adjust = useAction(adjustInventoryQuantity, {
    successToast: false,
    onSuccess: () => router.refresh(),
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (location !== 'ALL' && item.location !== location) return false;
      if (!needle) return true;
      return item.name.toLowerCase().includes(needle);
    });
  }, [items, location, query]);

  const lowStock = items.filter(
    (item) => item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold,
  );

  /** A sensible step for +/- given the unit. */
  const step = (unit: string) => (unit === 'g' || unit === 'ml' ? 100 : 1);

  return (
    <div className="space-y-4">
      {lowStock.length > 0 ? (
        <Card className="border-warning/40 bg-warning/5 p-3">
          <p className="text-sm font-medium text-warning">
            {lowStock.length} item{lowStock.length === 1 ? '' : 's'} at or below the low-stock level
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {lowStock
              .slice(0, 5)
              .map((i) => i.name)
              .join(', ')}
            {lowStock.length > 5 ? ` and ${lowStock.length - 5} more` : ''}
          </p>
        </Card>
      ) : null}

      <Tabs value={location} onValueChange={(v) => setLocation(v as typeof location)}>
        <TabsList>
          <TabsTrigger value="ALL">All</TabsTrigger>
          <TabsTrigger value="PANTRY">Pantry</TabsTrigger>
          <TabsTrigger value="FRIDGE">Fridge</TabsTrigger>
          <TabsTrigger value="FREEZER">Freezer</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search inventory"
            className="pl-9"
            aria-label="Search inventory"
          />
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Item
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={query ? 'Nothing matches' : 'No items here'}
          description={query ? undefined : 'Add what you keep in stock so grocery lists can subtract it.'}
        />
      ) : (
        <Card className="divide-y divide-border">
          {filtered.map((item) => {
            const low = item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold;
            return (
              <div key={item.id} className="flex items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium leading-tight">{item.name}</span>
                    {low ? <Badge variant="warning">Low</Badge> : null}
                    {!item.foodId ? <Badge variant="outline">Unlinked</Badge> : null}
                  </span>
                  <span className="tabular block text-xs text-muted-foreground">
                    {formatAmount(item.quantity, item.unit)} · {LOCATION_LABELS[item.location]}
                    {item.expiresOn ? ` · use by ${item.expiresOn}` : ''}
                  </span>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Reduce ${item.name}`}
                    disabled={adjust.isPending || item.quantity <= 0}
                    onClick={() => adjust.run({ id: item.id, delta: -step(item.unit) })}
                  >
                    <Minus className="size-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    aria-label={`Increase ${item.name}`}
                    disabled={adjust.isPending}
                    onClick={() => adjust.run({ id: item.id, delta: step(item.unit) })}
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent title="Add to inventory">
          <ItemForm foods={foods} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <SheetContent title={editing?.name ?? 'Item'}>
          {editing ? (
            <ItemForm
              key={editing.id}
              initial={editing}
              foods={foods}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <p className={cn('px-1 pb-2 text-xs text-muted-foreground')}>
        Grocery lists subtract linked items when the units convert. Where they cannot, the list says so
        rather than guessing.
      </p>
    </div>
  );
}
