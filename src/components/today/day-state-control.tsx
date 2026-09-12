'use client';

import { useState, useTransition } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { setDayType } from '@/lib/actions/day';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface DayTypeOption {
  id: string;
  name: string;
  isTraining: boolean;
  color: string;
}

interface DayStateControlProps {
  date: string;
  dayTypes: DayTypeOption[];
  currentDayTypeId: string | null;
  /** Meals already eaten or skipped today. Drives the confirmation. */
  loggedMealCount: number;
  totalMealCount: number;
}

/**
 * The Training / Rest control at the top of Today.
 *
 * Up to three day types render as a segmented control; more become a chip
 * that opens a list. Switching with nothing logged applies at once. Switching
 * after a meal is logged asks whether that meal keeps the portions it was
 * eaten with, because the default must never rewrite what was eaten.
 */
export function DayStateControl({
  date,
  dayTypes,
  currentDayTypeId,
  loggedMealCount,
  totalMealCount,
}: DayStateControlProps) {
  const [isPending, startTransition] = useTransition();
  const [pendingTypeId, setPendingTypeId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const current = dayTypes.find((d) => d.id === currentDayTypeId) ?? null;
  const pendingType = dayTypes.find((d) => d.id === pendingTypeId) ?? null;

  const apply = (dayTypeId: string) => {
    setPendingTypeId(null);
    setListOpen(false);
    startTransition(async () => {
      try {
        const result = await setDayType({ date, dayTypeId });
        if (!result.ok) toast.error(result.error);
      } catch {
        toast.error('Could not reach the server. The day was not changed.');
      }
    });
  };

  const choose = (dayTypeId: string) => {
    if (dayTypeId === currentDayTypeId) return;
    if (loggedMealCount > 0) setPendingTypeId(dayTypeId);
    else apply(dayTypeId);
  };

  const remaining = Math.max(0, totalMealCount - loggedMealCount);

  return (
    <div className="relative">
      {dayTypes.length <= 3 ? (
        <SegmentedControl
          aria-label="Day type"
          value={currentDayTypeId}
          disabled={isPending}
          onChange={choose}
          options={dayTypes.map((dayType) => ({
            value: dayType.id,
            label: dayType.name,
            activeClassName: dayType.isTraining ? 'bg-training text-primary-foreground' : 'bg-rest text-primary-foreground',
          }))}
        />
      ) : (
        <button
          type="button"
          disabled={isPending}
          onClick={() => setListOpen(true)}
          className={cn(
            'flex h-12 w-full items-center justify-between rounded-full px-5 font-semibold text-primary-foreground',
            current?.isTraining ? 'bg-training' : 'bg-rest',
          )}
        >
          <span>{current ? `${current.name} day` : 'Choose a day type'}</span>
          <ChevronDown className="size-5" aria-hidden />
        </button>
      )}

      {isPending ? (
        <span className="absolute inset-y-0 right-3 flex items-center" aria-live="polite">
          <Loader2 className="size-4 animate-spin text-primary-foreground" aria-hidden />
          <span className="sr-only">Updating the day</span>
        </span>
      ) : null}

      <Sheet open={listOpen} onOpenChange={setListOpen}>
        <SheetContent title="Day type" description="Today only. Your weekly schedule is unchanged.">
          <div className="space-y-2">
            {dayTypes.map((dayType) => (
              <button
                key={dayType.id}
                type="button"
                onClick={() => choose(dayType.id)}
                className={cn(
                  'flex min-h-12 w-full items-center gap-3 rounded-lg border p-3 text-left',
                  dayType.id === currentDayTypeId ? 'border-primary bg-primary/5' : 'border-border',
                )}
              >
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: dayType.color }} aria-hidden />
                <span className="flex-1 font-medium">{dayType.name}</span>
                <span className="text-xs text-muted-foreground">
                  {dayType.id === currentDayTypeId ? 'Current' : dayType.isTraining ? 'Training' : 'Rest'}
                </span>
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmSheet
        open={pendingType !== null}
        onOpenChange={(open) => !open && setPendingTypeId(null)}
        title={pendingType ? `Switch to a ${pendingType.name.toLowerCase()} day?` : 'Switch day type?'}
        description={
          `${loggedMealCount} meal${loggedMealCount === 1 ? ' is' : 's are'} already logged and will stay exactly as recorded. ` +
          `${pendingType?.name ?? 'New'} portions apply to the ${remaining} meal${remaining === 1 ? '' : 's'} still to come. ` +
          'Today only. Your weekly schedule is unchanged.'
        }
        actions={[
          {
            label: pendingType ? `Switch to ${pendingType.name.toLowerCase()}` : 'Switch',
            onClick: () => pendingType && apply(pendingType.id),
          },
        ]}
      />
    </div>
  );
}
