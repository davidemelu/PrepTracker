'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { MealForm, type DayTypeOption } from './meal-form';

export function NewMealButton({
  mealPlanId,
  dayTypes,
}: {
  mealPlanId: string;
  dayTypes: DayTypeOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Meal
        </Button>
      </SheetTrigger>
      <SheetContent title="New meal" description="Add a meal to this plan.">
        <MealForm
          mealPlanId={mealPlanId}
          dayTypes={dayTypes}
          onDone={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}
