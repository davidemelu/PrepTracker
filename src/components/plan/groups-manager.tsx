'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Replace } from 'lucide-react';
import { deleteOptionGroup, saveOptionGroup, setOptionPreference } from '@/lib/actions/foods';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox, Label } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface GroupRow {
  id: string;
  name: string;
  notes: string | null;
  preferredFoodId: string | null;
  usageCount: number;
  members: Array<{ id: string; name: string }>;
}

interface FoodOption {
  id: string;
  name: string;
}

function GroupForm({
  initial,
  foods,
  onDone,
  onCancel,
}: {
  initial?: GroupRow;
  foods: FoodOption[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [foodIds, setFoodIds] = useState<string[]>(initial?.members.map((m) => m.id) ?? []);
  const [preferredFoodId, setPreferredFoodId] = useState(initial?.preferredFoodId ?? '');

  const finish = () => {
    router.refresh();
    onDone();
  };

  const save = useAction(saveOptionGroup, { onSuccess: finish });
  const remove = useAction(deleteOptionGroup, { onSuccess: finish });

  const toggle = (id: string, checked: boolean) =>
    setFoodIds((prev) => (checked ? [...new Set([...prev, id])] : prev.filter((f) => f !== id)));

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="group-name">Name</Label>
        <Input
          id="group-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Meal 5 protein"
          aria-invalid={Boolean(save.fieldErrors.name)}
        />
        {save.fieldErrors.name ? (
          <p className="text-sm text-destructive">{save.fieldErrors.name[0]}</p>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">Foods to choose between</legend>
        {save.fieldErrors.foodIds ? (
          <p className="text-sm text-destructive">{save.fieldErrors.foodIds[0]}</p>
        ) : null}
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {foods.map((food) => (
            <label
              key={food.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-accent/40"
            >
              <Checkbox
                checked={foodIds.includes(food.id)}
                onCheckedChange={(checked) => toggle(food.id, checked === true)}
              />
              <span className="flex-1">{food.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {foodIds.length > 0 ? (
        <div className="space-y-1.5">
          <Label>Default choice</Label>
          <div className="flex flex-wrap gap-2">
            {foodIds.map((id) => {
              const food = foods.find((f) => f.id === id);
              if (!food) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPreferredFoodId(id)}
                  className={cn(
                    'h-10 rounded-lg border px-3 text-sm transition-colors',
                    preferredFoodId === id ? 'border-primary bg-primary/10 text-primary' : 'border-border',
                  )}
                >
                  {food.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="group-notes">Notes</Label>
        <Textarea
          id="group-notes"
          className="min-h-16"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {initial ? (
        <DeleteButton
          label="Delete group"
          title={`Delete ${initial.name}?`}
          description={`Used by ${initial.usageCount} ingredient${initial.usageCount === 1 ? '' : 's'}. Those lines lose their choice of foods. Days already logged are unchanged.`}
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
              name,
              notes,
              foodIds,
              preferredFoodId: preferredFoodId || undefined,
            } as unknown as Parameters<typeof saveOptionGroup>[0])
          }
        >
          Save
        </Button>
      </SheetFooter>
    </div>
  );
}

/**
 * Substitution groups. The "this week" row is the quick path: pick turkey for
 * the week and both meals 2 and 4 follow, along with the grocery list.
 */
export function GroupsManager({
  groups,
  foods,
  weekStart,
  weekPreferences,
}: {
  groups: GroupRow[];
  foods: FoodOption[];
  weekStart: string;
  weekPreferences: Record<string, string>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [adding, setAdding] = useState(false);

  const setPreference = useAction(setOptionPreference, { onSuccess: () => router.refresh() });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon={Replace}
          title="No substitution groups"
          description="Group foods you swap between, such as chicken or turkey, so a change applies everywhere at once."
          action={
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Create a group
            </Button>
          }
        />
      ) : (
        groups.map((group) => {
          const weekChoice = weekPreferences[group.id];
          const effective = weekChoice ?? group.preferredFoodId;

          return (
            <Card key={group.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold leading-tight">{group.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Used by {group.usageCount} ingredient{group.usageCount === 1 ? '' : 's'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setEditing(group)}>
                  Edit
                </Button>
              </div>

              {group.notes ? (
                <p className="mt-1 text-xs text-muted-foreground">{group.notes}</p>
              ) : null}

              <div className="mt-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  This week ({weekStart})
                </p>
                <div className="flex flex-wrap gap-2">
                  {group.members.map((member) => {
                    const active = effective === member.id;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        disabled={setPreference.isPending}
                        onClick={() =>
                          setPreference.run({
                            optionGroupId: group.id,
                            foodId: member.id,
                            weekStart,
                          })
                        }
                        className={cn(
                          'h-11 rounded-lg border px-3 text-sm font-medium transition-colors',
                          active
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:bg-accent',
                        )}
                      >
                        {member.name}
                        {group.preferredFoodId === member.id ? (
                          <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                            default
                          </Badge>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
                {weekChoice ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Set for this week only. Future weeks use the default.
                  </p>
                ) : null}
              </div>
            </Card>
          );
        })
      )}

      <Sheet open={adding} onOpenChange={setAdding}>
        <SheetContent title="New substitution group" description="Pick at least two interchangeable foods.">
          <GroupForm foods={foods} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </SheetContent>
      </Sheet>

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? undefined : setEditing(null))}>
        <SheetContent title={editing?.name ?? 'Group'}>
          {editing ? (
            <GroupForm
              key={editing.id}
              initial={editing}
              foods={foods}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
