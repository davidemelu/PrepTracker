'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Plus, Refrigerator, Snowflake, Utensils } from 'lucide-react';
import {
  addStoragePortion,
  deleteStoragePortion,
  moveToFridge,
  updateStoragePortion,
} from '@/lib/actions/prep';

import { eatFirstOrder, storageActions, type StoredPortionLike } from '@/lib/domain/storage';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DeleteButton } from '@/components/ui/delete-button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, NumberInput } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';


export interface PortionRow extends StoredPortionLike {
  portionSizeG: number | null;
  notes: string | null;
}

const LOCATION_ICON = {
  FRIDGE: Refrigerator,
  FREEZER: Snowflake,
  PANTRY: Utensils,
} as const;

/**
 * The storage planner. The top card answers the only question that matters on a
 * weekday evening: is there anything I need to move out of the freezer tonight?
 */
export function StorageManager({ portions, today }: { portions: PortionRow[]; today: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const refresh = () => router.refresh();
  const move = useAction(moveToFridge, { onSuccess: refresh });
  const update = useAction(updateStoragePortion, { successToast: false, onSuccess: refresh });
  const remove = useAction(deleteStoragePortion, { onSuccess: refresh });

  const actions = storageActions(portions, today);
  const moveNow = actions.filter((a) => a.kind === 'MOVE_TO_FRIDGE');
  const ordered = eatFirstOrder(portions) as PortionRow[];

  return (
    <div className="space-y-4">
      {moveNow.length > 0 ? (
        <Card className="border-warning/50 bg-warning/5 p-4">
          <h2 className="flex items-center gap-2 font-semibold text-warning">
            <Snowflake className="size-4" />
            Move to the fridge
          </h2>
          <ul className="mt-2 space-y-2">
            {moveNow.map((action) => (
              <li key={action.portion.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm">{action.message}</span>
                <Button
                  size="sm"
                  disabled={move.isPending}
                  onClick={() => move.run({ id: action.portion.id })}
                >
                  <Check className="size-4" />
                  Done
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-sm text-muted-foreground">
            Nothing needs moving out of the freezer right now.
          </p>
        </Card>
      )}

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {ordered.length === 0 ? (
        <EmptyState
          icon={Refrigerator}
          title="Nothing in storage"
          description="Finish a prep batch and store it, or add something by hand."
        />
      ) : (
        <Card className="divide-y divide-border">
          {ordered.map((portion) => {
            const Icon = LOCATION_ICON[portion.location];
            const eatFirst = actions.find(
              (a) => a.portion.id === portion.id && (a.kind === 'EAT_FIRST' || a.kind === 'EXPIRED'),
            );

            return (
              <div key={portion.id} className="p-3">
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium leading-tight">{portion.label}</span>
                      {portion.status === 'THAWING' ? <Badge variant="warning">Thawing</Badge> : null}
                      {portion.status === 'FROZEN' ? <Badge variant="secondary">Frozen</Badge> : null}
                      {eatFirst ? (
                        <Badge variant={eatFirst.kind === 'EXPIRED' ? 'destructive' : 'warning'}>
                          {eatFirst.kind === 'EXPIRED' ? 'Past use-by' : 'Eat today'}
                        </Badge>
                      ) : null}
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {portion.portions} portion{portion.portions === 1 ? '' : 's'}
                      {portion.portionSizeG ? ` × ${portion.portionSizeG} g` : ''} · prepped{' '}
                      {portion.prepDate}
                      {portion.useByDate ? ` · use by ${portion.useByDate}` : ''}
                      {portion.thawOn && portion.status === 'FROZEN' ? ` · thaw ${portion.thawOn}` : ''}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {portion.location === 'FREEZER' ? (
                        <Button variant="outline" size="sm" disabled={move.isPending} onClick={() => move.run({ id: portion.id })}>
                          Move to fridge
                        </Button>
                      ) : null}

                      {portion.status !== 'CONSUMED' ? (
                        <Button variant="ghost" size="sm" disabled={update.isPending} onClick={() => update.run({ id: portion.id, status: 'CONSUMED' })}>
                          Eaten
                        </Button>
                      ) : null}

                      <DeleteButton
                        label={`Remove ${portion.label}`}
                        title={`Remove ${portion.label}?`}
                        description="Removes it from storage tracking only. Nothing about the prep session or your history changes."
                        pending={remove.isPending}
                        onConfirm={() => remove.run({ id: portion.id })}
                        iconOnly
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <AddPortionSheet open={adding} onOpenChange={setAdding} onDone={refresh} today={today} />
    </div>
  );
}

function AddPortionSheet({
  open,
  onOpenChange,
  onDone,
  today,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  today: string;
}) {
  const [label, setLabel] = useState('');
  const [portions, setPortions] = useState('1');
  const [portionSizeG, setPortionSizeG] = useState('175');
  const [location, setLocation] = useState<'PANTRY' | 'FRIDGE' | 'FREEZER'>('FRIDGE');
  const [prepDate, setPrepDate] = useState(today);

  const add = useAction(addStoragePortion, {
    onSuccess: () => {
      setLabel('');
      onOpenChange(false);
      onDone();
    },
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title="Add to storage">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sp-label">Label</Label>
            <Input
              id="sp-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Chicken × 4"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sp-portions">Portions</Label>
              <NumberInput
                id="sp-portions"
                value={portions}
                onChange={(e) => setPortions(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-size">Portion (g)</Label>
              <NumberInput
                id="sp-size"
                value={portionSizeG}
                onChange={(e) => setPortionSizeG(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-location">Location</Label>
            <Select
              id="sp-location"
              value={location}
              onChange={(e) => setLocation(e.target.value as typeof location)}
            >
              <option value="FRIDGE">Refrigerator</option>
              <option value="FREEZER">Freezer</option>
              <option value="PANTRY">Pantry</option>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-date">Prepared on</Label>
            <input
              id="sp-date"
              type="date"
              value={prepDate}
              onChange={(e) => setPrepDate(e.target.value)}
              className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {add.error ? <p className="text-sm text-destructive">{add.error}</p> : null}
        </div>

        <SheetFooter>
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="flex-1"
            disabled={add.isPending}
            onClick={() =>
              add.run({
                label,
                portions,
                portionSizeG,
                location,
                prepDate,
              } as unknown as Parameters<typeof addStoragePortion>[0])
            }
          >
            Add
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

