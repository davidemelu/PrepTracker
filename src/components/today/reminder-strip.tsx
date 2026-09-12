'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, ChevronRight, Info } from 'lucide-react';
import type { Reminder } from '@/lib/domain/reminders';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/** Meal and supplement reminders already show as state on their own rows. */
const ROW_KINDS = new Set(['MEAL_DUE', 'MEAL_OVERDUE', 'SUPPLEMENT_DUE']);

const ICONS = { overdue: AlertTriangle, due: Bell, info: Info } as const;

/**
 * Everything else worth knowing today, in one row instead of a stack of
 * banners. Tapping it lists each reminder with a link to where it is handled.
 */
export function ReminderStrip({ reminders }: { reminders: Reminder[] }) {
  const [open, setOpen] = useState(false);
  const shown = reminders.filter((r) => !ROW_KINDS.has(r.kind));
  if (shown.length === 0) return null;

  const [first, second, ...rest] = shown;
  const urgent = shown.some((r) => r.severity === 'overdue');
  const Icon = urgent ? AlertTriangle : Bell;
  const summary = [first, second].filter(Boolean).map((r) => r!.title).join(' · ');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm',
          urgent ? 'border-warning/40 bg-warning/10 text-warning' : 'border-border bg-card text-foreground',
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {summary}
          {rest.length > 0 ? (
            <span className="text-muted-foreground"> · and {rest.length} more</span>
          ) : null}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="Reminders" description="Tap one to go where it is handled.">
          <ul className="space-y-2">
            {shown.map((reminder) => {
              const RowIcon = ICONS[reminder.severity];
              const body = (
                <span className="flex items-start gap-2.5">
                  <RowIcon
                    className={cn('mt-0.5 size-4 shrink-0', reminder.severity === 'info' ? 'text-muted-foreground' : 'text-warning')}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-tight">{reminder.title}</span>
                    {reminder.body ? (
                      <span className="mt-0.5 block text-xs text-muted-foreground">{reminder.body}</span>
                    ) : null}
                  </span>
                  {reminder.href && reminder.href !== '/today' ? (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  ) : null}
                </span>
              );
              const className = 'block rounded-lg border border-border p-3';
              return (
                <li key={reminder.id}>
                  {reminder.href && reminder.href !== '/today' ? (
                    <Link href={reminder.href} className={className} onClick={() => setOpen(false)}>
                      {body}
                    </Link>
                  ) : (
                    <div className={className}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
