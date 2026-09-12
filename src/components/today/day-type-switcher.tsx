'use client';

import { RotateCw } from 'lucide-react';
import { regenerateDay, setDayType } from '@/lib/actions/day';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface DayTypeSwitcherProps {
  date: string;
  currentDayTypeId: string | null;
  currentDayTypeName: string;
  isTraining: boolean;
  dayTypes: Array<{ id: string; name: string; isTraining: boolean; color: string }>;
}

/**
 * Overrides the day type for one date. The weekly pattern stays as it is, so a
 * one-off swapped rest day does not change every future Tuesday.
 */
export function DayTypeSwitcher({
  date,
  currentDayTypeId,
  currentDayTypeName,
  isTraining,
  dayTypes,
}: DayTypeSwitcherProps) {
  const change = useAction(setDayType);
  const regenerate = useAction(regenerateDay);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button type="button" aria-label="Change the day type">
          <Badge variant={isTraining ? 'training' : 'rest'} size="lg">
            {currentDayTypeName}
          </Badge>
        </button>
      </SheetTrigger>

      <SheetContent
        title="Day type"
        description="Applies to this date only. Your weekly schedule is unchanged."
      >
        <div className="space-y-2">
          {dayTypes.map((dayType) => (
            <button
              key={dayType.id}
              type="button"
              disabled={change.isPending}
              onClick={() => change.run({ date, dayTypeId: dayType.id })}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                dayType.id === currentDayTypeId
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent',
              )}
            >
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: dayType.color }}
                aria-hidden
              />
              <span className="flex-1 font-medium">{dayType.name}</span>
              {dayType.id === currentDayTypeId ? (
                <span className="text-xs text-muted-foreground">Current</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <Button
            variant="outline"
            size="block"
            onClick={() => regenerate.run({ date })}
            disabled={regenerate.isPending}
          >
            <RotateCw className="size-4" />
            Rebuild this day from the plan
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Use this after editing your meal plan or your meal timing if you want today to pick up the
            changes. Meals you have already marked as eaten stay marked, and keep the time you ate them.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
