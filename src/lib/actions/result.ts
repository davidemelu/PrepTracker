import { type z } from 'zod';

/**
 * One result shape for every server action.
 *
 * Actions never throw at the UI: they return a discriminated union so forms can
 * render a field-level message. Unexpected errors are caught centrally by
 * `runAction`, logged server-side, and surfaced as a readable sentence rather
 * than a stack trace.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]>; needsConfirmation?: boolean };

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function fail(
  error: string,
  extra?: { fieldErrors?: Record<string, string[]>; needsConfirmation?: boolean },
): ActionResult<never> {
  return { ok: false, error, ...extra };
}

/** Turn a Zod failure into field errors the form can render inline. */
export function fromZodError(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];

  for (const issue of error.issues) {
    const key = issue.path.map(String).join('.');
    if (key === '') formErrors.push(issue.message);
    else (fieldErrors[key] ??= []).push(issue.message);
  }

  const message =
    formErrors[0] ?? error.issues[0]?.message ?? 'Please check the values you entered.';

  return { ok: false, error: message, fieldErrors };
}

/**
 * Wraps an action body: validates input, runs it, and converts anything thrown
 * into a friendly result.
 */
export async function runAction<TInput, TOutput>(
  schema: z.ZodType<TInput>,
  input: unknown,
  handler: (value: TInput) => Promise<ActionResult<TOutput>>,
): Promise<ActionResult<TOutput>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return fromZodError(parsed.error);

  try {
    return await handler(parsed.data);
  } catch (error) {
    // Next uses thrown values for redirect() and notFound(); never swallow them.
    if (
      error &&
      typeof error === 'object' &&
      'digest' in error &&
      typeof (error as { digest?: unknown }).digest === 'string' &&
      ((error as { digest: string }).digest.startsWith('NEXT_REDIRECT') ||
        (error as { digest: string }).digest === 'NEXT_NOT_FOUND')
    ) {
      throw error;
    }

    console.error('[action]', error);
    const message =
      error instanceof Error && error.message ? error.message : 'Something went wrong. Please try again.';
    return fail(message);
  }
}
