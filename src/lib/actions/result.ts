import { unstable_rethrow } from 'next/navigation';
import { type z } from 'zod';
import { UserFacingError } from '@/lib/errors';

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

/** What the browser is told when the thrown error was not written for a reader. */
const GENERIC_ERROR = 'Something went wrong. Please try again.';

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

/** Prisma puts its error class on `code`; anything else may or may not have one. */
function errorCode(error: unknown): unknown {
  if (error && typeof error === 'object' && 'code' in error) {
    return (error as { code?: unknown }).code;
  }
  return undefined;
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
    // `unstable_rethrow` is the framework's own test for those, so it also covers
    // the request-time bailouts that the digest check it replaces did not, and it
    // keeps working when Next changes the shape of them.
    unstable_rethrow(error);

    // Only our own sentences reach the browser. Everything else thrown on the
    // server was written for a developer: a Prisma failure carries constraint
    // names, table names and the query arguments, and those arguments are the
    // food and weight data the whole application exists to keep on one machine.
    const userFacing = error instanceof UserFacingError;

    // The error object itself is not logged, because logging it invites a
    // console that prints the attached query arguments. The stack's first line
    // already carries the message for the errors whose message is withheld here.
    console.error('[action]', {
      name: error instanceof Error ? error.name : typeof error,
      code: errorCode(error),
      message: userFacing ? error.message : undefined,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return fail(userFacing && error.message ? error.message : GENERIC_ERROR);
  }
}
