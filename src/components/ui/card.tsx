import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 p-4 pb-2', className)} {...props} />;
}

/**
 * A card's heading.
 *
 * `h2` by default, because a card sits directly under the page's `h1` and
 * hard-coding `h3` skipped a level on every screen that uses one. Pass `as` for
 * a card nested inside a section that already has its own heading.
 */
export function CardTitle({
  className,
  as: Tag = 'h2',
  ...props
}: React.ComponentProps<'h2'> & { as?: 'h2' | 'h3' | 'h4' }) {
  return <Tag className={cn('text-base font-semibold leading-tight tracking-tight', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('p-4 pt-2', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-2 p-4 pt-0', className)} {...props} />;
}
