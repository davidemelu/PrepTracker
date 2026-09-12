import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} {...props} />;
}

/**
 * The shape of a tab page while its data loads: a header block and three card
 * placeholders. Shown by each route's `loading.tsx`, so tapping a tab always
 * changes the screen immediately even on a slow LAN.
 */
export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 safe-top">
        <div className="space-y-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-10 w-24 rounded-full" />
      </div>
      <div className="mx-auto max-w-3xl space-y-4 px-4">
        <Skeleton className="h-12 w-full rounded-full" />
        {Array.from({ length: cards }).map((_, index) => (
          <Skeleton key={index} className="h-36 w-full rounded-xl" />
        ))}
      </div>
      <p className="sr-only">Loading</p>
    </div>
  );
}
