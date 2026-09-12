'use client';

import { useCallback, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { ActionResult } from '@/lib/actions/result';

interface UseActionOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
  /** Show a toast on success. Defaults to true when the action returns a message. */
  successToast?: boolean;
  /** Called when the action asks for confirmation, e.g. a duplicate water entry. */
  onNeedsConfirmation?: (message: string) => void;
}

/**
 * Calls a server action with pending state, error toasts and optimistic-friendly
 * transitions. Keeps every call site down to one line and guarantees errors are
 * surfaced rather than swallowed.
 */
export function useAction<TInput, TOutput>(
  action: (input: TInput) => Promise<ActionResult<TOutput>>,
  options: UseActionOptions<TOutput> = {},
) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const run = useCallback(
    (input: TInput) => {
      setError(null);
      setFieldErrors({});

      startTransition(async () => {
        const result = await action(input);

        if (result.ok) {
          if (result.message && options.successToast !== false) toast.success(result.message);
          options.onSuccess?.(result.data);
          return;
        }

        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});

        if (result.needsConfirmation) {
          options.onNeedsConfirmation?.(result.error);
          return;
        }

        if (options.onError) options.onError(result.error);
        else toast.error(result.error);
      });
    },
    [action, options],
  );

  return { run, isPending, error, fieldErrors, reset: () => { setError(null); setFieldErrors({}); } };
}
