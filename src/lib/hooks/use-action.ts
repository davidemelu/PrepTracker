'use client';

import { useCallback, useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { toast } from 'sonner';
import type { ActionResult } from '@/lib/actions/result';

/**
 * What the user is told when the call never reached the server.
 *
 * Distinct from an error the server sent back: nothing was written, nothing was
 * validated, and the value they typed is still on screen to try again with. The
 * phone being offline and the home server being down look identical from here,
 * so the sentence covers both.
 */
export const UNREACHABLE_MESSAGE =
  'Could not reach the server, so nothing was saved. Your change is still on screen.';

/**
 * Call a server action and turn a failed round trip into a result.
 *
 * Server actions convert anything *thrown inside them* into a result, but a
 * request that never arrives rejects in the caller. Inside a transition that
 * rejection goes to the nearest error boundary, which unmounts the route — so a
 * dropped connection while tapping "Mark eaten" replaced the screen with an
 * error page instead of saying the tap did not land.
 */
export async function callAction<T>(
  call: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch (error) {
    // Navigation and not-found are signalled by throwing; they are not failures.
    unstable_rethrow(error);
    return { ok: false, error: UNREACHABLE_MESSAGE };
  }
}

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
        const result = await callAction(() => action(input));

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
