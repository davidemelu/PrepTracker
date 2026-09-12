import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { UserFacingError } from '@/lib/errors';
import { fail, ok, runAction } from '@/lib/actions/result';

const GENERIC = 'Something went wrong. Please try again.';

const schema = z.object({ name: z.string().min(1, 'Enter a name.') });

/** The shape Prisma throws: a developer-facing sentence carrying the submitted data. */
function prismaError(): Error {
  const error = new Error(
    'Invalid `prisma.food.create()` invocation: Unique constraint failed on the fields: (`userId`,`name`). args: { name: "Chicken thigh", proteinPer100g: 24.2 }',
  );
  error.name = 'PrismaClientKnownRequestError';
  return Object.assign(error, { code: 'P2002' });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runAction', () => {
  it('returns the handler result when nothing goes wrong', async () => {
    const result = await runAction(schema, { name: 'Rice' }, async (input) => ok(input.name));
    expect(result).toEqual({ ok: true, data: 'Rice', message: undefined });
  });

  it('turns a Zod failure into field errors', async () => {
    const result = await runAction(schema, { name: '' }, async () => ok('unreachable'));
    expect(result).toEqual({
      ok: false,
      error: 'Enter a name.',
      fieldErrors: { name: ['Enter a name.'] },
    });
  });

  it('passes a returned failure through untouched', async () => {
    const result = await runAction(schema, { name: 'Rice' }, async () => fail('Not enough rice.'));
    expect(result).toEqual({ ok: false, error: 'Not enough rice.' });
  });

  it('shows the message of an error written for the user', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runAction(schema, { name: 'Rice' }, async () => {
      throw new UserFacingError('That meal could not be found.');
    });

    expect(result).toEqual({ ok: false, error: 'That meal could not be found.' });
    expect(log).toHaveBeenCalledWith(
      '[action]',
      expect.objectContaining({ name: 'UserFacingError', message: 'That meal could not be found.' }),
    );
  });

  it('hides everything else behind one generic sentence', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runAction(schema, { name: 'Rice' }, async () => {
      throw prismaError();
    });

    expect(result).toEqual({ ok: false, error: GENERIC });
    if (result.ok) throw new Error('unreachable');
    expect(result.error).not.toContain('Chicken thigh');
    expect(result.error).not.toContain('prisma');
  });

  it('logs the class and code but neither the error object nor its message', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runAction(schema, { name: 'Rice' }, async () => {
      throw prismaError();
    });

    expect(log).toHaveBeenCalledTimes(1);
    const [prefix, payload] = log.mock.calls[0] ?? [];
    expect(prefix).toBe('[action]');
    expect(payload).toMatchObject({ name: 'PrismaClientKnownRequestError', code: 'P2002' });
    expect(payload).not.toBeInstanceOf(Error);
    expect((payload as { message?: string }).message).toBeUndefined();
    // The stack still carries the detail, which is where a diagnosis comes from.
    expect((payload as { stack?: string }).stack).toContain('Chicken thigh');
  });

  it('lets a Next redirect through instead of reporting it as a failure', async () => {
    const redirectError = Object.assign(new Error('NEXT_REDIRECT'), {
      digest: 'NEXT_REDIRECT;replace;/login;307;',
    });

    await expect(
      runAction(schema, { name: 'Rice' }, async () => {
        throw redirectError;
      }),
    ).rejects.toBe(redirectError);
  });
});
