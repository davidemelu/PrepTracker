'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  MinusCircle,
  Pencil,
  PlayCircle,
  Repeat,
} from 'lucide-react';
import {
  completeMeal,
  rescheduleMeal,
  setMealActualTime,
  skipMeal,
  undoMealCompletion,
  updateItemQuantity,
  updateMealNotes,
} from '@/lib/actions/day';
import { addMinutes, currentTimeString, formatDuration, formatTime12h, formatTimeRange, formatTimingDelta } from '@/lib/domain/time';
import { formatAmount } from '@/lib/domain/units';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { NumberInput, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { Sheet, SheetContent, SheetFooter } from '@/components/ui/sheet';
import { SwapSheet } from '@/components/today/swap-sheet';
import { cn } from '@/lib/utils';
import type { DayItemView, DayMealView, SubstitutionOptionMap } from '@/lib/queries/day';

export type MealRowState = 'done' | 'next' | 'pending' | 'overdue' | 'skipped';

interface MealRowProps {
  meal: DayMealView;
  state: MealRowState;
  /** Minutes until the meal (next) or since it was due (overdue). */
  minutes?: number;
  substitutions: SubstitutionOptionMap;
}

const STATE_LABEL: Record<string, string> = { RAW: 'raw', COOKED: 'cooked', AS_IS: '' };

const timeInputClass =
  'flex h-12 w-full rounded-lg border border-input bg-background px-3 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function StateIcon({ state }: { state: MealRowState }) {
  switch (state) {
    case 'done':
      return <CheckCircle2 className="size-6 text-success" aria-hidden />;
    case 'next':
      return <PlayCircle className="size-6 text-primary" aria-hidden />;
    case 'overdue':
      return <AlertCircle className="size-6 text-warning" aria-hidden />;
    case 'skipped':
      return <MinusCircle className="size-6 text-muted-foreground" aria-hidden />;
    default:
      return <Circle className="size-6 text-muted-foreground/70" aria-hidden />;
  }
}

/**
 * One meal in the day's timeline. Collapsed it is a 56px row that says what
 * happened; opened in place it shows the plate and every "today only" edit.
 */
export function MealRow({ meal, state, minutes, substitutions }: MealRowProps) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<'none' | 'time' | 'amounts' | 'notes' | 'reschedule'>('none');
  const [swapping, setSwapping] = useState<DayItemView | null>(null);

  const [actualValue, setActualValue] = useState(meal.actualTime ?? '');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [notesValue, setNotesValue] = useState(meal.notes ?? '');
  const [timeValue, setTimeValue] = useState(meal.scheduledTime ?? '');
  const [shiftLater, setShiftLater] = useState(true);

  const close = () => setSheet('none');
  const complete = useAction(completeMeal, { successToast: false });
  const undo = useAction(undoMealCompletion, { successToast: false });
  const skip = useAction(skipMeal, { successToast: false });
  const setActual = useAction(setMealActualTime, { successToast: false, onSuccess: close });
  const setNotes = useAction(updateMealNotes, { successToast: false, onSuccess: close });
  const reschedule = useAction(rescheduleMeal, { successToast: false, onSuccess: close });
  const setQuantity = useAction(updateItemQuantity, { successToast: false });

  const isDone = meal.status === 'COMPLETED';
  const isSkipped = meal.status === 'SKIPPED';
  const planned = meal.scheduledTime ? formatTimeRange(meal.scheduledTime, meal.windowMinutes) : 'No time set';
  const delta = meal.actualTime && meal.scheduledTime ? formatTimingDelta(meal.scheduledTime, meal.actualTime) : null;

  let secondary: string;
  switch (state) {
    case 'done':
      secondary = `${meal.scheduledTime ? formatTime12h(meal.scheduledTime) : 'Planned'} → ${
        meal.actualTime ? formatTime12h(meal.actualTime) : 'eaten'
      }${delta && delta !== 'on time' ? ` · ${delta}` : ''}`;
      break;
    case 'next':
      secondary = `${planned}${minutes != null ? ` · in ${formatDuration(minutes)}` : ''}`;
      break;
    case 'overdue':
      secondary = `${planned}${minutes != null ? ` · ${formatDuration(-Math.abs(minutes))}` : ''}`;
      break;
    case 'skipped':
      secondary = 'Skipped';
      break;
    default:
      secondary = `${planned}${meal.isPreWorkout ? ' · Pre-workout' : ''}`;
  }

  const openTimeSheet = () => {
    setActualValue(meal.actualTime ?? currentTimeString());
    setSheet('time');
  };

  const openAmounts = () => {
    setAmounts(Object.fromEntries(meal.items.map((i) => [i.id, String(i.quantity)])));
    setSheet('amounts');
  };

  const saveAmounts = async () => {
    for (const item of meal.items) {
      const raw = amounts[item.id];
      if (raw == null) continue;
      const value = Number(raw.replace(',', '.'));
      if (Number.isFinite(value) && value > 0 && value !== item.quantity) {
        setQuantity.run({ dailyMealItemId: item.id, quantity: value });
      }
    }
    close();
  };

  return (
    <li className="border-t border-border first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
      >
        <StateIcon state={state} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {/*
              A span, not a heading. The whole row is the disclosure button and
              a heading inside a button is neither valid nor useful: a screen
              reader reading the button announces the name already, and the
              list sits under the section's own "Meals" heading.
            */}
            <span className={cn('text-[17px] font-semibold leading-6', isSkipped && 'text-muted-foreground')}>{meal.name}</span>
            {state === 'next' ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Next</span>
            ) : null}
          </span>
          <span className={cn('tabular block text-[13px] leading-[18px]', state === 'overdue' ? 'text-warning' : 'text-muted-foreground')}>
            {secondary}
          </span>
        </span>
        {open ? (
          <ChevronDown className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="space-y-3 bg-background/60 px-4 pb-4 pt-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Planned {planned}</span>
            {isDone ? (
              <button
                type="button"
                onClick={openTimeSheet}
                className="flex h-11 items-center gap-1.5 rounded-full bg-success/12 px-3 text-sm font-semibold text-success"
              >
                <Check className="size-3.5" strokeWidth={3} aria-hidden />
                Eaten {meal.actualTime ? formatTime12h(meal.actualTime) : ''}
                <Pencil className="size-3.5" aria-hidden />
                <span className="sr-only">Change the time eaten</span>
              </button>
            ) : null}
          </div>

          <ul className="space-y-1 border-t border-border pt-2">
            {meal.items.map((item) => {
              const group = item.optionGroupId ? substitutions[item.optionGroupId] : undefined;
              const canSwap = Boolean(group && group.options.length > 1) && !isDone && !isSkipped;
              const stateLabel = STATE_LABEL[item.state];
              return (
                <li key={item.id} className="flex min-h-7 items-baseline gap-3 text-[15px]">
                  {isDone ? <Check className="size-4 shrink-0 self-center text-success" aria-hidden /> : null}
                  <span className="tabular w-16 shrink-0 text-right font-semibold">{formatAmount(item.quantity, item.unit)}</span>
                  <span className={cn('min-w-0 flex-1', !item.required && 'text-muted-foreground')}>
                    {item.foodName}
                    {stateLabel ? <span className="text-muted-foreground"> ({stateLabel})</span> : null}
                    {item.isSubstituted ? <span className="text-xs text-muted-foreground"> · swapped</span> : null}
                    {item.isQuantityOverridden ? <span className="text-xs text-muted-foreground"> · adjusted</span> : null}
                  </span>
                  {canSwap ? (
                    <button type="button" onClick={() => setSwapping(item)} className="-my-2 h-11 shrink-0 px-1 text-sm font-semibold text-primary">
                      Swap
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          {meal.notes ? <p className="rounded-lg bg-muted p-2 text-xs text-muted-foreground">{meal.notes}</p> : null}

          {!isDone && !isSkipped ? (
            <Button variant="success" size="block" disabled={complete.isPending} onClick={() => complete.run({ dailyMealId: meal.id })}>
              {complete.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Check className="size-5" strokeWidth={3} aria-hidden />}
              Mark eaten
            </Button>
          ) : null}

          <div className="flex flex-wrap gap-x-1 gap-y-0 border-t border-border pt-1 text-sm font-semibold text-primary">
            {!isDone && !isSkipped ? (
              <button type="button" className="h-11 px-2" onClick={openTimeSheet}>
                Ate it earlier
              </button>
            ) : null}
            <button type="button" className="h-11 px-2" onClick={openAmounts}>
              Edit amounts
            </button>
            <button type="button" className="h-11 px-2" onClick={() => setSheet('notes')}>
              Note
            </button>
            {!isDone && !isSkipped ? (
              <button type="button" className="h-11 px-2" onClick={() => setSheet('reschedule')}>
                Reschedule
              </button>
            ) : null}
            {!isDone && !isSkipped ? (
              <button type="button" className="h-11 px-2 text-muted-foreground" disabled={skip.isPending} onClick={() => skip.run({ dailyMealId: meal.id })}>
                Skip
              </button>
            ) : (
              <button type="button" className="h-11 px-2 text-muted-foreground" disabled={undo.isPending} onClick={() => undo.run({ dailyMealId: meal.id })}>
                {isSkipped ? 'Undo skip' : 'Undo eaten'}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {/* Time eaten ---------------------------------------------------------- */}
      <Sheet open={sheet === 'time'} onOpenChange={(o) => !o && close()}>
        <SheetContent
          title={`When did you eat ${meal.name}?`}
          description={`Planned for ${planned}. Your planned time stays as it is.${!isDone ? ' Saving also marks it eaten.' : ''}`}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`actual-${meal.id}`}>Time eaten</Label>
              <input id={`actual-${meal.id}`} type="time" value={actualValue} onChange={(e) => setActualValue(e.target.value)} className={timeInputClass} />
            </div>
            <div className="flex flex-wrap gap-2">
              {[15, 30].map((m) => (
                <Button key={m} variant="outline" size="sm" className="rounded-full" onClick={() => actualValue && setActualValue(addMinutes(actualValue, -m))}>
                  −{m} min
                </Button>
              ))}
              {meal.scheduledTime ? (
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => setActualValue(meal.scheduledTime!)}>
                  As planned · {formatTime12h(meal.scheduledTime)}
                </Button>
              ) : null}
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => setActualValue(currentTimeString())}>
                Now
              </Button>
            </div>
            {/* role="alert" so a failure inside a sheet is spoken, not just drawn. */}
            {setActual.error ? <p role="alert" className="text-sm text-destructive">{setActual.error}</p> : null}
          </div>
          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={close}>Cancel</Button>
            <Button className="flex-1" disabled={setActual.isPending || !actualValue} onClick={() => setActual.run({ dailyMealId: meal.id, actualTime: actualValue, markCompleted: true })}>
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Amounts ------------------------------------------------------------- */}
      <Sheet open={sheet === 'amounts'} onOpenChange={(o) => !o && close()}>
        <SheetContent title={`Amounts for ${meal.name}`} description="Today only. Your saved plan is not changed.">
          <div className="space-y-3">
            {meal.items.map((item) => (
              <div key={item.id} className="flex items-center gap-3">
                <Label htmlFor={`qty-${item.id}`} className="min-w-0 flex-1 truncate">{item.foodName}</Label>
                <NumberInput id={`qty-${item.id}`} className="w-28" value={amounts[item.id] ?? ''} onChange={(e) => setAmounts((prev) => ({ ...prev, [item.id]: e.target.value }))} />
                <span className="w-10 shrink-0 text-sm text-muted-foreground">{item.unit}</span>
              </div>
            ))}
          </div>
          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={close}>Cancel</Button>
            <Button className="flex-1" disabled={setQuantity.isPending} onClick={saveAmounts}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Note ---------------------------------------------------------------- */}
      <Sheet open={sheet === 'notes'} onOpenChange={(o) => !o && close()}>
        <SheetContent title={`Note on ${meal.name}`}>
          <Textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} placeholder="Ran out of rice, used potatoes instead…" />
          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={close}>Cancel</Button>
            <Button className="flex-1" disabled={setNotes.isPending} onClick={() => setNotes.run({ dailyMealId: meal.id, notes: notesValue })}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Reschedule ---------------------------------------------------------- */}
      <Sheet open={sheet === 'reschedule'} onOpenChange={(o) => !o && close()}>
        <SheetContent title={`Reschedule ${meal.name}`} description="Today only.">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`sched-${meal.id}`}>Planned time</Label>
              <input id={`sched-${meal.id}`} type="time" value={timeValue} onChange={(e) => setTimeValue(e.target.value)} className={timeInputClass} />
            </div>
            <label className="flex min-h-12 items-center gap-3 rounded-lg border border-border px-3">
              <input type="checkbox" checked={shiftLater} onChange={(e) => setShiftLater(e.target.checked)} className="size-5 accent-[var(--primary)]" />
              <span className="text-sm"><Repeat className="mr-1 inline size-3.5" aria-hidden />Move later meals by the same amount</span>
            </label>
          </div>
          <SheetFooter>
            <Button variant="outline" className="flex-1" onClick={close}>Cancel</Button>
            <Button className="flex-1" disabled={reschedule.isPending} onClick={() => reschedule.run({ dailyMealId: meal.id, scheduledTime: timeValue, shiftLater })}>Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <SwapSheet item={swapping} substitutions={substitutions} onClose={() => setSwapping(null)} />
    </li>
  );
}
