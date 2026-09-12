import { z } from 'zod';
import { isValidDayKey } from '@/lib/domain/dates';
import { isValidTime } from '@/lib/domain/time';
import { findUnit } from '@/lib/domain/units';

/**
 * Shared Zod building blocks.
 *
 * The messages are written to be shown directly to the user — "Quantity cannot
 * be negative" rather than "Expected number >= 0".
 */

/** Accepts "1.5" from a text input as well as a real number. */
export const numberish = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
}, z.number({ error: 'Enter a number.' }));

export const quantity = numberish
  .refine((v) => Number.isFinite(v), 'Enter a number.')
  .refine((v) => v >= 0, 'Quantity cannot be negative.')
  .refine((v) => v <= 1_000_000, 'That quantity is unrealistically large.');

export const positiveQuantity = quantity.refine((v) => v > 0, 'Quantity must be greater than 0.');

export const optionalQuantity = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  quantity.optional(),
);

export const wholeNumber = numberish
  .refine((v) => Number.isInteger(v), 'Enter a whole number.')
  .refine((v) => v >= 0, 'Cannot be negative.');

export const unitString = z
  .string()
  .trim()
  .min(1, 'Choose a unit.')
  .max(24, 'Unit name is too long.')
  .refine((value) => Boolean(findUnit(value)), {
    message: 'That unit is not recognised. Pick one from the list so quantities can be added up.',
  });

/** Units used for supplement dosages are free text: mg, IU, billion CFU. */
export const dosageUnitString = z.string().trim().min(1).max(24);

export const nonEmptyName = z
  .string()
  .trim()
  .min(1, 'Name cannot be empty.')
  .max(120, 'Name must be 120 characters or fewer.');

export const optionalText = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().max(2000, 'That note is too long.').optional(),
);

export const timeString = z
  .string()
  .trim()
  .refine(isValidTime, 'Enter a time as HH:mm, for example 13:30.');

export const optionalTimeString = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  timeString.optional(),
);

export const dayKey = z
  .string()
  .trim()
  .refine(isValidDayKey, 'Enter a valid date.');

export const optionalDayKey = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  dayKey.optional(),
);

export const cuid = z.string().trim().min(1, 'Missing identifier.');

export const optionalCuid = z.preprocess(
  (v) => (v === '' || v === null || v === 'none' ? undefined : v),
  cuid.optional(),
);

export const rating = z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  numberish
    .refine((v) => Number.isInteger(v), 'Ratings are whole numbers.')
    .refine((v) => v >= 1 && v <= 5, 'Ratings run from 1 to 5.')
    .optional(),
);

/** Checkbox values arrive as "on" | "true" | boolean depending on the form. */
export const checkbox = z.preprocess(
  (v) => v === true || v === 'true' || v === 'on' || v === '1',
  z.boolean(),
);
