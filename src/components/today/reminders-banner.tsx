import Link from 'next/link';
import { AlertTriangle, Bell, Info } from 'lucide-react';
import type { Reminder } from '@/lib/domain/reminders';
import { cn } from '@/lib/utils';

const STYLES = {
  overdue: { wrapper: 'border-destructive/40 bg-destructive/10 text-destructive', Icon: AlertTriangle },
  due: { wrapper: 'border-warning/40 bg-warning/10 text-warning', Icon: Bell },
  info: { wrapper: 'border-border bg-muted text-muted-foreground', Icon: Info },
} as const;

/**
 * In-app reminders. The same descriptors would drive browser or push
 * notifications later; nothing about the decision logic lives here.
 */
export function RemindersBanner({ reminders }: { reminders: Reminder[] }) {
  if (reminders.length === 0) return null;

  const top = reminders.slice(0, 3);
  const extra = reminders.length - top.length;

  return (
    <div className="space-y-2">
      {top.map((reminder) => {
        const style = STYLES[reminder.severity];
        const Icon = style.Icon;
        const content = (
          <div className={cn('flex items-start gap-2.5 rounded-xl border p-3', style.wrapper)}>
            <Icon className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-tight">{reminder.title}</p>
              {reminder.body ? <p className="mt-0.5 text-xs opacity-90">{reminder.body}</p> : null}
            </div>
          </div>
        );

        return reminder.href ? (
          <Link key={reminder.id} href={reminder.href} className="block">
            {content}
          </Link>
        ) : (
          <div key={reminder.id}>{content}</div>
        );
      })}

      {extra > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          and {extra} more reminder{extra === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
