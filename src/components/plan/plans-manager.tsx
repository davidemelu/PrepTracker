'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Plus } from 'lucide-react';
import {
  activateMealPlan,
  deleteMealPlan,
  duplicateMealPlan,
  saveMealPlan,
} from '@/lib/actions/plan';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteButton } from '@/components/ui/delete-button';
import { Card } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';

export interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  mealCount: number;
}

/**
 * Multiple plans, one active. Switching plans does not rewrite any day you have
 * already logged — it only changes what future days are built from.
 */
export function PlansManager({ plans }: { plans: PlanRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const refresh = () => router.refresh();

  const save = useAction(saveMealPlan, {
    onSuccess: () => {
      setAdding(false);
      setEditing(null);
      setName('');
      setDescription('');
      refresh();
    },
  });
  const activate = useAction(activateMealPlan, { onSuccess: refresh });
  const duplicate = useAction(duplicateMealPlan, { onSuccess: refresh });
  const remove = useAction(deleteMealPlan, { onSuccess: refresh });

  const openEditor = (plan: PlanRow | null) => {
    setName(plan?.name ?? '');
    setDescription(plan?.description ?? '');
    if (plan) setEditing(plan);
    else setAdding(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => openEditor(null)}>
          <Plus className="size-4" />
          Plan
        </Button>
      </div>

      {plans.map((plan) => (
        <Card key={plan.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h3 className="font-semibold leading-tight">{plan.name}</h3>
                {plan.isActive ? <Badge variant="success">Active</Badge> : null}
              </div>
              {plan.description ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{plan.description}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {plan.mealCount} meal{plan.mealCount === 1 ? '' : 's'}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => openEditor(plan)}>
              Rename
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {!plan.isActive ? (
              <Button
                size="sm"
                disabled={activate.isPending}
                onClick={() => activate.run({ id: plan.id })}
              >
                <Check className="size-4" />
                Make active
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={duplicate.isPending}
              onClick={() => duplicate.run({ id: plan.id })}
            >
              <Copy className="size-4" />
              Duplicate
            </Button>
            {plans.length > 1 ? (
              <DeleteButton
                label="Delete plan"
                title={`Delete "${plan.name}"?`}
                description="The plan and its meals are removed. Days you have already logged are unchanged."
                pending={remove.isPending}
                onConfirm={() => remove.run({ id: plan.id })}
                size="sm"
              />
            ) : null}
          </div>
        </Card>
      ))}

      <Sheet
        open={adding || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
      >
        <SheetContent title={editing ? 'Rename plan' : 'New plan'}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="plan-name">Name</Label>
              <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} />
              {save.fieldErrors.name ? (
                <p className="text-sm text-destructive">{save.fieldErrors.name[0]}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-description">Description</Label>
              <Textarea
                id="plan-description"
                className="min-h-16"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            {save.error ? <p className="text-sm text-destructive">{save.error}</p> : null}
            <SheetFooter>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setAdding(false);
                  setEditing(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={save.isPending}
                onClick={() =>
                  save.run({
                    id: editing?.id,
                    name,
                    description,
                  } as unknown as Parameters<typeof saveMealPlan>[0])
                }
              >
                Save
              </Button>
            </SheetFooter>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
