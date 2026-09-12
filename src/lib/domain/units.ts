/**
 * Unit registry and conversion.
 *
 * Three dimensions that never mix: MASS, VOLUME and COUNT. Grocery aggregation
 * only ever sums quantities that share a dimension; anything else stays as a
 * separate line rather than producing a silently wrong number.
 */

export type UnitDimension = 'MASS' | 'VOLUME' | 'COUNT';

export interface UnitDefinition {
  /** Canonical lowercase key, e.g. "g". */
  key: string;
  label: string;
  plural?: string;
  dimension: UnitDimension;
  /** How many base units (g / ml / each) one of this unit is worth. */
  toBase: number;
  /** Alternative spellings accepted from user input and imports. */
  aliases?: string[];
}

export const UNIT_DEFINITIONS: readonly UnitDefinition[] = [
  // Mass — base gram
  { key: 'g', label: 'g', dimension: 'MASS', toBase: 1, aliases: ['gram', 'grams', 'gm'] },
  { key: 'kg', label: 'kg', dimension: 'MASS', toBase: 1000, aliases: ['kilogram', 'kilograms'] },
  { key: 'oz', label: 'oz', dimension: 'MASS', toBase: 28.349523125, aliases: ['ounce', 'ounces'] },
  { key: 'lb', label: 'lb', dimension: 'MASS', toBase: 453.59237, aliases: ['lbs', 'pound', 'pounds'] },
  // Volume — base millilitre
  { key: 'ml', label: 'mL', dimension: 'VOLUME', toBase: 1, aliases: ['millilitre', 'milliliter'] },
  { key: 'l', label: 'L', dimension: 'VOLUME', toBase: 1000, aliases: ['litre', 'liter', 'litres', 'liters'] },
  { key: 'tsp', label: 'tsp', dimension: 'VOLUME', toBase: 4.92892159375, aliases: ['teaspoon', 'teaspoons'] },
  { key: 'tbsp', label: 'tbsp', dimension: 'VOLUME', toBase: 14.78676478125, aliases: ['tablespoon', 'tablespoons', 'tbs'] },
  { key: 'cup', label: 'cup', plural: 'cups', dimension: 'VOLUME', toBase: 236.5882365, aliases: ['cups'] },
  { key: 'floz', label: 'fl oz', dimension: 'VOLUME', toBase: 29.5735295625, aliases: ['fl-oz', 'fluid ounce'] },
  // Count — base "each"
  { key: 'each', label: 'each', dimension: 'COUNT', toBase: 1, aliases: ['ea', 'unit', 'units', 'piece', 'pieces', 'x'] },
  { key: 'serving', label: 'serving', plural: 'servings', dimension: 'COUNT', toBase: 1, aliases: ['servings', 'portion', 'portions'] },
  { key: 'scoop', label: 'scoop', plural: 'scoops', dimension: 'COUNT', toBase: 1, aliases: ['scoops'] },
  { key: 'capsule', label: 'capsule', plural: 'capsules', dimension: 'COUNT', toBase: 1, aliases: ['capsules', 'cap', 'caps'] },
  { key: 'tablet', label: 'tablet', plural: 'tablets', dimension: 'COUNT', toBase: 1, aliases: ['tablets', 'tab', 'tabs'] },
  { key: 'pack', label: 'pack', plural: 'packs', dimension: 'COUNT', toBase: 1, aliases: ['packs', 'package', 'packages', 'bag', 'bags'] },
] as const;

/**
 * Dosage-only units. They are never aggregated or converted; they exist so a
 * supplement can be recorded as "3000 IU" or "500 mg" without inventing a
 * conversion that does not exist.
 */
export const DOSAGE_UNITS = ['mg', 'mcg', 'g', 'iu', 'ml', 'billion CFU', '%'] as const;

const UNIT_LOOKUP: ReadonlyMap<string, UnitDefinition> = (() => {
  const map = new Map<string, UnitDefinition>();
  for (const def of UNIT_DEFINITIONS) {
    map.set(def.key, def);
    for (const alias of def.aliases ?? []) map.set(alias, def);
  }
  return map;
})();

export function normaliseUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\.$/, '');
}

export function findUnit(unit: string): UnitDefinition | undefined {
  return UNIT_LOOKUP.get(normaliseUnit(unit));
}

export function unitDimension(unit: string): UnitDimension | undefined {
  return findUnit(unit)?.dimension;
}

/** True when two units can be summed without losing meaning. */
export function areUnitsCompatible(a: string, b: string): boolean {
  const da = unitDimension(a);
  const db = unitDimension(b);
  if (!da || !db) return normaliseUnit(a) === normaliseUnit(b);
  return da === db;
}

/**
 * Convert a quantity between units of the same dimension.
 * Returns null when the conversion is not defined, so callers must decide what
 * to do rather than receiving a wrong number.
 */
export function convert(quantity: number, from: string, to: string): number | null {
  const f = findUnit(from);
  const t = findUnit(to);
  if (!f || !t) {
    return normaliseUnit(from) === normaliseUnit(to) ? quantity : null;
  }
  if (f.dimension !== t.dimension) return null;
  return (quantity * f.toBase) / t.toBase;
}

/** Base unit key for a dimension: g, ml or each. */
export function baseUnitFor(dimension: UnitDimension): string {
  return dimension === 'MASS' ? 'g' : dimension === 'VOLUME' ? 'ml' : 'each';
}

export function toBase(quantity: number, unit: string): { quantity: number; unit: string } | null {
  const def = findUnit(unit);
  if (!def) return null;
  return { quantity: quantity * def.toBase, unit: baseUnitFor(def.dimension) };
}

/** Round to at most `dp` decimals without leaving 1.2000000000000002 artefacts. */
export function round(value: number, dp = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** dp;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Pick a friendlier unit for display: 1500 g -> 1.5 kg, 2000 ml -> 2 L.
 * Only scales up, never down, and never touches count units.
 */
export function humaniseQuantity(quantity: number, unit: string): { quantity: number; unit: string } {
  const def = findUnit(unit);
  if (!def) return { quantity: round(quantity), unit };
  if (def.dimension === 'MASS' && def.key === 'g' && Math.abs(quantity) >= 1000) {
    return { quantity: round(quantity / 1000, 2), unit: 'kg' };
  }
  if (def.dimension === 'VOLUME' && def.key === 'ml' && Math.abs(quantity) >= 1000) {
    return { quantity: round(quantity / 1000, 2), unit: 'L' };
  }
  return { quantity: round(quantity, 2), unit: def.label };
}

const VULGAR_FRACTIONS: ReadonlyArray<[number, string]> = [
  [0.25, '1/4'],
  [0.333, '1/3'],
  [0.5, '1/2'],
  [0.666, '2/3'],
  [0.75, '3/4'],
];

/**
 * Format a count quantity the way a recipe would: 0.5 each -> "1/2",
 * 2 each -> "2". Fractions only apply to count units, never to grams.
 */
export function formatQuantity(quantity: number, unit: string): string {
  const def = findUnit(unit);
  const label = def?.label ?? unit;

  if (def?.dimension === 'COUNT') {
    const whole = Math.floor(quantity);
    const frac = round(quantity - whole, 3);
    const match = VULGAR_FRACTIONS.find(([value]) => Math.abs(value - frac) < 0.01);
    const numberPart = match
      ? whole > 0
        ? `${whole} ${match[1]}`
        : match[1]
      : String(round(quantity, 2));
    if (def.key === 'each') return numberPart;
    const useplural = quantity !== 1 && def.plural;
    return `${numberPart} ${useplural ? def.plural : label}`;
  }

  // Small volumes such as 1/4 tsp read better as fractions too.
  if (def?.dimension === 'VOLUME' && (def.key === 'tsp' || def.key === 'tbsp' || def.key === 'cup')) {
    const whole = Math.floor(quantity);
    const frac = round(quantity - whole, 3);
    const match = VULGAR_FRACTIONS.find(([value]) => Math.abs(value - frac) < 0.01);
    if (match) return `${whole > 0 ? `${whole} ` : ''}${match[1]} ${label}`;
  }

  return `${round(quantity, 2)} ${label}`;
}

/** "175 g" / "1/2" / "0.25 tsp" with the unit already humanised. */
export function formatAmount(quantity: number, unit: string): string {
  const def = findUnit(unit);
  if (def && (def.key === 'g' || def.key === 'ml') && Math.abs(quantity) >= 1000) {
    const h = humaniseQuantity(quantity, unit);
    return `${h.quantity} ${h.unit}`;
  }
  return formatQuantity(quantity, unit);
}
