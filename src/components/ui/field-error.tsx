import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldErrorProps {
  /** Nothing renders when this is absent, so call sites need no conditional. */
  children?: string | null;
  /**
   * Point the input's `aria-describedby` at this, so a screen reader reads the
   * reason along with the field rather than leaving the user to hunt for it.
   */
  id?: string;
  className?: string;
}

/**
 * The one way a form says what went wrong.
 *
 * Every inline error used to be a bare paragraph: no `role`, so a failed save
 * inside a sheet was silent for a screen reader, and no id, so `aria-invalid`
 * marked the field without anything explaining why. Both come free here.
 *
 * `role="alert"` rather than a polite live region, because these only ever
 * appear in response to something the user just did, and they are the reason
 * the thing they did has not happened.
 */
export function FieldError({ children, id, className }: FieldErrorProps) {
  if (!children) return null;

  return (
    <p
      id={id}
      role="alert"
      className={cn('flex items-start gap-1.5 text-sm text-destructive', className)}
    >
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}
