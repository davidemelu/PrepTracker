'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, MoreVertical, Play, Trash2 } from 'lucide-react';
import { deletePrepSession, setPrepSessionStatus } from '@/lib/actions/prep';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export function SessionActions({ sessionId, status }: { sessionId: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const refresh = () => {
    router.refresh();
    setOpen(false);
  };

  const setStatus = useAction(setPrepSessionStatus, { onSuccess: refresh });
  const remove = useAction(deletePrepSession, {
    onSuccess: () => {
      router.push('/prep');
      router.refresh();
    },
  });

  return (
    <>
      <Button variant="ghost" size="icon" aria-label="Session options" onClick={() => setOpen(true)}>
        <MoreVertical className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Prep session">
          <div className="space-y-2">
            {status === 'PLANNED' ? (
              <Button
                size="block"
                disabled={setStatus.isPending}
                onClick={() => setStatus.run({ id: sessionId, status: 'IN_PROGRESS' })}
              >
                <Play className="size-4" />
                Start prepping
              </Button>
            ) : null}

            {status !== 'COMPLETED' ? (
              <Button
                variant="outline"
                size="block"
                disabled={setStatus.isPending}
                onClick={() => setStatus.run({ id: sessionId, status: 'COMPLETED' })}
              >
                <CheckCircle2 className="size-4" />
                Mark as finished
              </Button>
            ) : (
              <Button
                variant="outline"
                size="block"
                disabled={setStatus.isPending}
                onClick={() => setStatus.run({ id: sessionId, status: 'IN_PROGRESS' })}
              >
                Reopen session
              </Button>
            )}

            <Button
              variant="ghost"
              size="block"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={remove.isPending}
              onClick={() => {
                if (confirm('Delete this prep session? Measured cooking yields are kept.')) {
                  remove.run({ id: sessionId });
                }
              }}
            >
              <Trash2 className="size-4" />
              Delete session
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
