'use client';

import { Check } from 'lucide-react';
import { substituteMealItem } from '@/lib/actions/day';
import { useAction } from '@/lib/hooks/use-action';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { DayItemView, SubstitutionOptionMap } from '@/lib/queries/day';

interface SwapSheetProps {
  item: DayItemView | null;
  substitutions: SubstitutionOptionMap;
  onClose: () => void;
}

/** One tap swaps a grouped ingredient for today only and closes. */
export function SwapSheet({ item, substitutions, onClose }: SwapSheetProps) {
  const swap = useAction(substituteMealItem, { successToast: false, onSuccess: onClose });
  const group = item?.optionGroupId ? substitutions[item.optionGroupId] : undefined;

  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent title={group ? `Swap ${group.name}` : 'Swap'} description="Today only. Your plan is not changed.">
        <div className="space-y-2">
          {(group?.options ?? []).map((option) => {
            const current = option.id === item?.foodId;
            return (
              <button
                key={option.id}
                type="button"
                disabled={swap.isPending || current}
                onClick={() => item && swap.run({ dailyMealItemId: item.id, foodId: option.id })}
                className={cn(
                  'flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-left font-medium',
                  current ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent',
                )}
              >
                <span className="flex-1">{option.name}</span>
                {current ? <Check className="size-4 text-primary" aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
