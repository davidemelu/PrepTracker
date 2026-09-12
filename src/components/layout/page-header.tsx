import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Renders a back chevron pointing at this route. */
  backHref?: string;
  action?: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
  className,
  sticky = true,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'z-30 border-b border-border bg-background/95 backdrop-blur-sm',
        sticky && 'sticky top-0',
        className,
      )}
    >
      {/*
        Wraps rather than squeezes: with large accessibility text the actions
        drop under the title instead of truncating "Today" to "To…".
      */}
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 safe-top">
        {backHref ? (
          <Link
            href={backHref}
            className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Back"
          >
            <ChevronLeft className="size-5" />
          </Link>
        ) : null}

        <div className="min-w-[8rem] flex-1">
          <h1 className="truncate text-[22px] font-semibold leading-7 tracking-tight">{title}</h1>
          {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>

        {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
      </div>
    </header>
  );
}

/** Standard page body width and padding. */
export function PageBody({ className, ...props }: React.ComponentProps<'main'>) {
  return <main className={cn('mx-auto w-full max-w-3xl space-y-4 px-4 py-4', className)} {...props} />;
}

export function SectionTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      className={cn('px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground', className)}
      {...props}
    />
  );
}
