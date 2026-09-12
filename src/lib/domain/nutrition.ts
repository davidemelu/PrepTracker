/**
 * Optional nutrition layer.
 *
 * Every macro is nullable and stays nullable: if a food has no values entered,
 * the app still works and the totals simply say how much is unknown rather than
 * pretending the missing food contains nothing.
 */

import { convert, round } from './units';

export interface Macros {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fibre: number | null;
  sodium: number | null;
}

export const EMPTY_MACROS: Macros = {
  calories: null,
  protein: null,
  carbs: null,
  fat: null,
  fibre: null,
  sodium: null,
};

export const MACRO_KEYS = ['calories', 'protein', 'carbs', 'fat', 'fibre', 'sodium'] as const;
export type MacroKey = (typeof MACRO_KEYS)[number];

export const MACRO_LABELS: Record<MacroKey, string> = {
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
  fibre: 'Fibre',
  sodium: 'Sodium',
};

export const MACRO_UNITS: Record<MacroKey, string> = {
  calories: 'kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
  fibre: 'g',
  sodium: 'mg',
};

export interface NutritionSource {
  /** Macro values per `basisQty` of `basisUnit`, typically per 100 g. */
  basisQty: number;
  basisUnit: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  fibre?: number | null;
  sodium?: number | null;
}

/**
 * Scale a food's reference nutrition to an actual portion.
 * Returns null when the portion unit cannot be converted to the basis unit
 * (e.g. nutrition per 100 g but the ingredient is "2 each").
 */
export function macrosForQuantity(
  source: NutritionSource | null | undefined,
  quantity: number,
  unit: string,
): Macros {
  if (!source || source.basisQty <= 0) return { ...EMPTY_MACROS };

  const converted = convert(quantity, unit, source.basisUnit);
  if (converted === null) return { ...EMPTY_MACROS };

  const factor = converted / source.basisQty;
  const scale = (value: number | null | undefined): number | null =>
    value == null || !Number.isFinite(value) ? null : round(value * factor, 2);

  return {
    calories: scale(source.calories),
    protein: scale(source.protein),
    carbs: scale(source.carbs),
    fat: scale(source.fat),
    fibre: scale(source.fibre),
    sodium: scale(source.sodium),
  };
}

export interface MacroTotals extends Macros {
  /** Items that contributed at least one value. */
  itemsWithData: number;
  itemsTotal: number;
  /** Names of items with no nutrition entered, so the UI can be honest. */
  missing: string[];
  get complete(): boolean;
}

/** Sum macros, treating null as "unknown" rather than zero. */
export function sumMacros(
  items: readonly { name: string; macros: Macros }[],
): MacroTotals {
  const totals: Record<MacroKey, number | null> = {
    calories: null,
    protein: null,
    carbs: null,
    fat: null,
    fibre: null,
    sodium: null,
  };
  const missing: string[] = [];
  let itemsWithData = 0;

  for (const item of items) {
    let contributed = false;
    for (const key of MACRO_KEYS) {
      const value = item.macros[key];
      if (value == null) continue;
      totals[key] = round((totals[key] ?? 0) + value, 2);
      contributed = true;
    }
    if (contributed) itemsWithData += 1;
    else missing.push(item.name);
  }

  return {
    ...totals,
    itemsWithData,
    itemsTotal: items.length,
    missing,
    get complete() {
      return this.itemsTotal > 0 && this.missing.length === 0;
    },
  };
}

/** Add two macro sets, preserving "unknown". */
export function addMacros(a: Macros, b: Macros): Macros {
  const out = { ...EMPTY_MACROS };
  for (const key of MACRO_KEYS) {
    const left = a[key];
    const right = b[key];
    out[key] = left == null && right == null ? null : round((left ?? 0) + (right ?? 0), 2);
  }
  return out;
}

export function scaleMacros(macros: Macros, factor: number): Macros {
  const out = { ...EMPTY_MACROS };
  for (const key of MACRO_KEYS) {
    const value = macros[key];
    out[key] = value == null ? null : round(value * factor, 2);
  }
  return out;
}

export function formatMacro(key: MacroKey, value: number | null): string {
  if (value == null) return '—';
  const rounded = key === 'calories' || key === 'sodium' ? Math.round(value) : round(value, 1);
  return `${rounded} ${MACRO_UNITS[key]}`;
}

/**
 * Energy from macros, useful as a sanity check when calories were not entered
 * but the individual macros were. 4/4/9 kcal per gram.
 */
export function derivedCalories(macros: Macros): number | null {
  const { protein, carbs, fat } = macros;
  if (protein == null && carbs == null && fat == null) return null;
  return round((protein ?? 0) * 4 + (carbs ?? 0) * 4 + (fat ?? 0) * 9, 0);
}
