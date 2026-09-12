'use client';

import { Loader2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';

export interface ConfirmAction {
  label: string;
  onClick: () => void;
  variant?: ButtonProps['variant'];
  pending?: boolean;
}

interface ConfirmSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Phrased as a question: "Delete this list?" */
  title: string;
  /** One sentence on what will and will not change. */
  description: string;
  /** First action is the recommended one and renders as the primary button. */
  actions: ConfirmAction[];
  cancelLabel?: string;
}

/**
 * The one confirmation pattern in the app. Replaces native `confirm()` so the
 * consequence is spelled out and the buttons are named after the verb.
 */
export function ConfirmSheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
  cancelLabel = 'Cancel',
}: ConfirmSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={title} description={description}>
        <div className="flex flex-col gap-2">
          {actions.map((action, index) => (
            <Button
              key={action.label}
              size="block"
              variant={action.variant ?? (index === 0 ? 'default' : 'outline')}
              disabled={action.pending}
              onClick={action.onClick}
            >
              {action.pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {action.label}
            </Button>
          ))}
          <Button size="block" variant="ghost" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
