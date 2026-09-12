'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { ConfirmSheet } from '@/components/ui/confirm-sheet';
import { cn } from '@/lib/utils';

interface DeleteButtonProps {
  /** Button text, e.g. "Delete meal". Also used as the confirm button label. */
  label: string;
  /** Sheet title as a question: "Delete Meal 2?" */
  title: string;
  /** What is and is not lost. */
  description: string;
  onConfirm: () => void;
  pending?: boolean;
  size?: ButtonProps['size'];
  className?: string;
  /** Icon-only trigger for dense rows; the label becomes the accessible name. */
  iconOnly?: boolean;
}

/**
 * A destructive action that always asks first, with the consequence spelled
 * out. Every permanent delete in the app goes through this.
 */
export function DeleteButton({
  label,
  title,
  description,
  onConfirm,
  pending,
  size = 'default',
  className,
  iconOnly = false,
}: DeleteButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={iconOnly ? 'icon' : size}
        aria-label={iconOnly ? label : undefined}
        className={cn('text-destructive hover:bg-destructive/10 hover:text-destructive', className)}
        disabled={pending}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" aria-hidden />
        {iconOnly ? null : label}
      </Button>
      <ConfirmSheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        actions={[
          {
            label,
            variant: 'destructive',
            pending,
            onClick: () => {
              setOpen(false);
              onConfirm();
            },
          },
        ]}
      />
    </>
  );
}
