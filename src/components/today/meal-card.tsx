'use client';

import { useState } from 'react';
import {
  Check,
  Clock,
  Dumbbell,
  MoreVertical,
  Pencil,
  Repeat,
  SkipForward,
  Undo2,
} from 'lucide-react';
import {
  completeMeal,
  rescheduleMeal,
  setMealActualTime,
  skipMeal,
  substituteMealItem,
  undoMealCompletion,
  updateItemQuantity,
  updateMealNotes,
} from '@/lib/actions/day';
import { currentTimeString, formatTime12h, formatTimeRange, formatTimingDelta } from '@/lib/domain/time';
import { formatAmount } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NumberInput, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Select } from '@/components/ui/select';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DayMealView, SubstitutionOptionMap } from '@/lib/queries/day';

interface MealCardProps {
  meal: DayMealView;
  substitutions: SubstitutionOptionMap;
  isNext: boolean;
  isOverdue: boolean;
}

const STATE_LABEL: Record<string, string> = { RAW: 'raw', COOKED: 'cooked', AS_IS: '' };

export function MealCard({ meal, substitutions, isNext, isOverdue }: MealCardProps) {
  const [sheet, setSheet] = useState<
    'none' | 'options' | 'time' | 'notes' | 'quantity' | 'actual'
  >('none');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [quantityValue, setQuantityValue] = useState('');
  const [timeValue, setTimeValue] = useState(meal.scheduledTime ?? '');
  const [shiftLater, setShiftLater] = useState(true);
  const [notesValue, setNotesValue] = useState(meal.notes ?? '');
  const [actualValue, setActualValue] = useState(meal.actualTime ?? '');

  const close = () => {
    setSheet('none');
    setEditingItemId(null);
  };

  const complete = useAction(completeMeal);
  const undo = useAction(undoMealCompletion);
  const skip = useAction(skipMeal, { onSuccess: close });
  const substitute = useAction(substituteMealItem, { onSuccess: close });
  const setQuantity = useAction(updateItemQuantity, { onSuccess: close });
  const setTime = useAction(rescheduleMeal, { onSuccess: close });
  const setNotes = useAction(updateMealNotes, { onSuccess: close });
  const setActual = useAction(setMealActualTime, { onSuccess: close });

  const isDone = meal.status === 'COMPLETED';
  const isSkipped = meal.status === 'SKIPPED';
  const busy = complete.isPending || undo.isPending;

  const editingItem = meal.items.find((i) => i.id === editingItemId) ?? null;

  // Only worth showing once both times exist, and only when they differ enough
  // to be interesting.
  const timing =
    meal.actualTime && meal.scheduledTime
      ? formatTimingDelta(meal.scheduledTime, meal.actualTime)
      : null;

  return (
    <>
      <Card
        className={cn(
          'overflow-hidden transition-colors',
          isDone && 'border-success/40 bg-success/5',
          isSkipped && 'opacity-60',
          isNext && !isDone && !isSkipped && 'border-primary/50 ring-1 ring-primary/20',
          isOverdue && !isDone && !isSkipped && 'border-warning/50',
        )}
      >
        <div className="flex items-start gap-3 p-4 pb-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className={cn('text-base font-semibold leading-tight', isDone && 'text-success')}>
                {meal.name}
              </h3>
              {meal.isPreWorkout ? (
                <Badge variant="secondary" className="gap-1">
                  <Dumbbell className="size-3" />
                  Pre-workout
                </Badge>
              ) : null}
              {isNext && !isDone && !isSkipped ? <Badge>Next</Badge> : null}
              {isOverdue && !isDone && !isSkipped ? <Badge variant="warning">Overdue</Badge> : null}
              {isSkipped ? <Badge variant="secondary">Skipped</Badge> : null}
            </div>

            <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
              <Clock className="size-3.5" />
              <span>
                Planned{' '}
                {meal.scheduledTime
                  ? formatTimeRange(meal.scheduledTime, meal.windowMinutes)
                  : 'not set'}
              </span>
              {meal.actualTime ? (
                <span className={cn(isDone && 'text-success')}>
                  {'· Eaten '}
                  {formatTime12h(meal.actualTime)}
                </span>
              ) : null}
            </p>

            {timing ? (
              <p className="text-xs text-muted-foreground">{timing}</p>
            ) : null}
          </div>

          <Button
            variant="ghost"
            size="icon"
            aria-label={`Options for ${meal.name}`}
            onClick={() => setSheet('options')}
          >
            <MoreVertical className="size-5" />
          </Button>
        </div>

        <ul className="space-y-1.5 px-4 pb-3">
          {meal.items.map((item) => {
            const group = item.optionGroupId ? substitutions[item.optionGroupId] : undefined;
            const state = STATE_LABEL[item.state];
            return (
              <li key={item.id} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className={cn(!item.required && 'text-muted-foreground')}>{item.foodName}</span>
                  {state ? <span className="text-muted-foreground"> ({state})</span> : null}
                  {item.isSubstituted ? (
                    <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                      swapped
                    </Badge>
                  ) : null}
                  {item.isQuantityOverridden ? (
                    <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-[10px]">
                      adjusted
                    </Badge>
                  ) : null}
                  {group && group.options.length > 1 ? (
                    <span className="block text-xs text-muted-foreground">
                      or {group.options.filter((o) => o.id !== item.foodId).map((o) => o.name).join(' / ')}
                    </span>
                  ) : null}
                </span>
                <span className="tabular shrink-0 font-medium">{formatAmount(item.quantity, item.unit)}</span>
              </li>
            );
          })}
        </ul>

        {meal.notes ? (
          <p className="mx-4 mb-3 rounded-lg bg-muted p-2 text-xs text-muted-foreground">{meal.notes}</p>
        ) : null}

        <div className="border-t border-border p-3">
          {isDone || isSkipped ? (
            <Button
              variant="outline"
              size="block"
              onClick={() => undo.run({ dailyMealId: meal.id })}
              disabled={busy}
            >
              <Undo2 className="size-4" />
              {isSkipped ? 'Un-skip' : 'Undo'}
            </Button>
          ) : (
            <Button
              variant="success"
              size="block"
              onClick={() => complete.run({ dailyMealId: meal.id })}
              disabled={busy}
            >
              <Check className="size-5" strokeWidth={3} />
              Mark as eaten
            </Button>
          )}
        </div>
      </Card>

      {/* Options ------------------------------------------------------------ */}
      <Sheet open={sheet === 'options'} onOpenChange={(open) => (open ? setSheet('options') : close())}>
        <SheetContent title={meal.name} description="Changes here apply to today only.">
          <div className="space-y-2">
            {meal.items.map((item) => {
              const group = item.optionGroupId ? substitutions[item.optionGroupId] : undefined;
              return (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{item.foodName}</span>
                    <span className="tabular text-sm text-muted-foreground">
                      {formatAmount(item.quantity, item.unit)}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingItemId(item.id);
                        setQuantityValue(String(item.quantity));
                        setSheet('quantity');
                      }}
                    >
                      <Pencil className="size-3.5" />
                      Change amount
                    </Button>

                    {group && group.options.length > 1 ? (
                      <Select
                        className="h-9 w-auto flex-1 text-sm"
                        aria-label={`Swap ${group.name}`}
                        value={item.foodId ?? ''}
                        onChange={(e) =>
                          substitute.run({ dailyMealItemId: item.id, foodId: e.target.value })
                        }
                        disabled={substitute.isPending}
                      >
                        {group.options.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => setSheet('time')}>
              <Clock className="size-4" />
              Reschedule
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setActualValue(meal.actualTime ?? currentTimeString());
                setSheet('actual');
              }}
            >
              <Clock className="size-4" />
              Time eaten
            </Button>
            <Button variant="outline" onClick={() => setSheet('notes')}>
              <Pencil className="size-4" />
              Note
            </Button>
            {meal.status === 'PENDING' ? (
              <Button
                variant="outline"
                className="col-span-2"
                onClick={() => skip.run({ dailyMealId: meal.id })}
                disabled={skip.isPending}
              >
                <SkipForward className="size-4" />
                Skip this meal
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* Quantity ----------------------------------------------------------- */}
      <Sheet open={sheet === 'quantity'} onOpenChange={(open) => (open ? setSheet('quantity') : close())}>
        <SheetContent
          title={editingItem ? `Amount of ${editingItem.foodName}` : 'Amount'}
          description="Today only. Your saved plan is not changed."
        >
          <div className="space-y-1.5">
            <Label htmlFor="item-quantity">Quantity ({editingItem?.unit})</Label>
            <NumberInput
              id="item-quantity"
              value={quantityValue}
              onChange={(e) => setQuantityValue(e.target.value)}
              autoFocus
            />
          </div>
          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={setQuantity.isPending || !editingItem}
              onClick={() =>
                editingItem &&
                setQuantity.run({
                  dailyMealItemId: editingItem.id,
                  quantity: Number(quantityValue.replace(',', '.')),
                })
              }
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Reschedule --------------------------------------------------------- */}
      <Sheet open={sheet === 'time'} onOpenChange={(open) => (open ? setSheet('time') : close())}>
        <SheetContent title={`Reschedule ${meal.name}`} description="Today only.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="meal-time">Time</Label>
              <input
                id="meal-time"
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={shiftLater}
                onChange={(e) => setShiftLater(e.target.checked)}
                className="size-5 accent-[var(--primary)]"
              />
              <span className="text-sm">
                <Repeat className="mr-1 inline size-3.5" />
                Move later meals by the same amount
              </span>
            </label>
          </div>

          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={setTime.isPending}
              onClick={() => setTime.run({ dailyMealId: meal.id, scheduledTime: timeValue, shiftLater })}
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Time eaten --------------------------------------------------------- */}
      <Sheet open={sheet === 'actual'} onOpenChange={(open) => (open ? setSheet('actual') : close())}>
        <SheetContent
          title={`When did you eat ${meal.name}?`}
          description="Corrects the recorded time. Your planned time stays as it is."
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="actual-time">Time eaten</Label>
              <input
                id="actual-time"
                type="time"
                value={actualValue}
                onChange={(e) => setActualValue(e.target.value)}
                className="flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <p className="rounded-lg bg-muted p-2.5 text-xs text-muted-foreground">
              Planned for{' '}
              {meal.scheduledTime ? formatTimeRange(meal.scheduledTime, meal.windowMinutes) : 'no set time'}.
              {meal.status !== 'COMPLETED'
                ? ' Saving a time also marks this meal as eaten.'
                : ''}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setActualValue(currentTimeString())}>
                Now
              </Button>
              {meal.scheduledTime ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActualValue(meal.scheduledTime!)}
                >
                  As planned
                </Button>
              ) : null}
            </div>

            {setActual.error ? <p className="text-sm text-destructive">{setActual.error}</p> : null}
          </div>

          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={setActual.isPending}
              onClick={() =>
                setActual.run({
                  dailyMealId: meal.id,
                  actualTime: actualValue,
                  markCompleted: true,
                })
              }
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Notes -------------------------------------------------------------- */}
      <Sheet open={sheet === 'notes'} onOpenChange={(open) => (open ? setSheet('notes') : close())}>
        <SheetContent title={`Note on ${meal.name}`}>
          <Textarea
            value={notesValue}
            onChange={(e) => setNotesValue(e.target.value)}
            placeholder="Ran out of rice, used potatoes instead…"
            autoFocus
          />
          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={close}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              disabled={setNotes.isPending}
              onClick={() => setNotes.run({ dailyMealId: meal.id, notes: notesValue })}
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
