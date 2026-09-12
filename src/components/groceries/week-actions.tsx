'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MoreVertical, PackagePlus, Trash2 } from 'lucide-react';
import {
  addPurchasesToInventory,
  deleteGroceryWeek,
  setGroceryWeekStatus,
} from '@/lib/actions/groceries';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export function WeekActions({ weekId, status }: { weekId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const refresh = () => {
    router.refresh();
    setOpen(false);
  };

  const setStatus = useAction(setGroceryWeekStatus, { onSuccess: refresh });
  const stock = useAction(addPurchasesToInventory, { onSuccess: refresh });
  const remove = useAction(deleteGroceryWeek, {
    onSuccess: () => {
      router.push('/groceries');
      router.refresh();
    },
  });

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="List options" onClick={() => setOpen(true)}>
        <MoreVertical className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="List options">
          <div className="space-y-2">
            {status !== 'COMPLETED' ? (
              <Button
                variant="outline"
                size="block"
                disabled={setStatus.isPending}
                onClick={() => setStatus.run({ id: weekId, status: 'COMPLETED' })}
              >
                <CheckCircle2 className="size-4" />
                Mark shopping as done
              </Button>
            ) : (
              <Button
                variant="outline"
                size="block"
                disabled={setStatus.isPending}
                onClick={() => setStatus.run({ id: weekId, status: 'ACTIVE' })}
              >
                Reopen this list
              </Button>
            )}

            <Button
              variant="outline"
              size="block"
              disabled={stock.isPending}
              onClick={() => stock.run({ id: weekId })}
            >
              <PackagePlus className="size-4" />
              Add what I bought to inventory
            </Button>
            <p className="px-1 text-xs text-muted-foreground">
              Adds every ticked item that is linked to a food, so your next list can subtract it.
            </p>

            <Button
              variant="ghost"
              size="block"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm('Delete this grocery list? This cannot be undone.')) {
                  remove.run({ id: weekId });
                }
              }}
            >
              <Trash2 className="size-4" />
              Delete list
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
