'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { formatAmount } from '@/lib/domain/units';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface PlanMealRow {
  id: string;
  name: string;
  timeLabel: string | null;
  isPreWorkout: boolean;
  isPostWorkout: boolean;
  active: boolean;
  /** Day types this meal is eaten on. */
  dayTypeIds: string[];
  ingredients: Array<{
    id: string;
    label: string;
    optionNames: string[] | null;
    unit: string;
    state: 'RAW' | 'COOKED' | 'AS_IS';
    required: boolean;
    quantities: Record<string, number>;
  }>;
}

/**
 * The plan's meals with one amount column at a time. Pick Training or Rest at
 * the top instead of reading "225 g / 175 g" and remembering which is which.
 */
export function PlanMealList({ meals, dayTypes }: { meals: PlanMealRow[]; dayTypes: Array<{ id: string; name: string; isTraining: boolean }> }) {
  const [dayTypeId, setDayTypeId] = useState(dayTypes[0]?.id ?? '');
  const dayType = dayTypes.find((d) => d.id === dayTypeId) ?? dayTypes[0];

  return (
    <div className="space-y-3">
      {dayTypes.length > 1 ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Portions for</span>
          {dayTypes.length <= 3 ? (
            <SegmentedControl
              aria-label="Portions for day type"
              size="sm"
              className="w-56 max-w-full"
              value={dayTypeId}
              onChange={setDayTypeId}
              options={dayTypes.map((d) => ({ value: d.id, label: d.name, activeClassName: d.isTraining ? undefined : 'bg-rest' }))}
            />
          ) : (
            <Select aria-label="Portions for day type" className="h-11 w-48" value={dayTypeId} onChange={(e) => setDayTypeId(e.target.value)}>
              {dayTypes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
        </div>
      ) : null}

      {meals.map((meal) => {
        const onThisDay = !dayType || meal.dayTypeIds.includes(dayType.id);
        return (
          <Link key={meal.id} href={`/plan/meals/${meal.id}`} className="block">
            <Card className={cn('p-4 transition-colors hover:bg-accent/40', !onThisDay && 'opacity-70')}>
              <div className="flex items-center gap-2">
                <h3 className="text-[17px] font-semibold leading-6">{meal.name}</h3>
                {meal.isPreWorkout ? <Badge variant="secondary">Pre-workout</Badge> : null}
                {meal.isPostWorkout ? <Badge variant="secondary">Post-workout</Badge> : null}
                {!meal.active ? <Badge variant="secondary">Inactive</Badge> : null}
                <span className="flex-1" />
                {meal.timeLabel ? <span className="tabular text-sm text-muted-foreground">{meal.timeLabel}</span> : null}
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </div>

              {!onThisDay ? (
                <p className="mt-2 text-sm text-muted-foreground">Not eaten on {dayType?.name.toLowerCase()} days.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {meal.ingredients.map((ingredient) => {
                    const qty = dayType ? (ingredient.quantities[dayType.id] ?? 0) : 0;
                    return (
                      <li key={ingredient.id} className="flex items-baseline gap-3 text-[15px]">
                        <span className={cn('tabular w-16 shrink-0 text-right font-semibold', qty === 0 && 'text-muted-foreground')}>
                          {qty === 0 ? '—' : formatAmount(qty, ingredient.unit)}
                        </span>
                        <span className={cn('min-w-0 flex-1', (!ingredient.required || qty === 0) && 'text-muted-foreground')}>
                          {ingredient.label}
                          {ingredient.state !== 'AS_IS' ? <span className="text-muted-foreground"> ({ingredient.state.toLowerCase()})</span> : null}
                          {ingredient.optionNames && ingredient.optionNames.length > 1 ? (
                            <span className="block text-xs text-muted-foreground">or {ingredient.optionNames.join(' / ')}</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                  {meal.ingredients.length === 0 ? <li className="text-sm text-muted-foreground">No ingredients yet</li> : null}
                </ul>
              )}
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
