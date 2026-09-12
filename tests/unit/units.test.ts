import { describe, expect, it } from 'vitest';
import {
  areUnitsCompatible,
  convert,
  findUnit,
  formatAmount,
  formatQuantity,
  humaniseQuantity,
  normaliseUnit,
  round,
  toBase,
  unitDimension,
} from '@/lib/domain/units';

describe('unit lookup', () => {
  it('normalises case, whitespace and trailing dots', () => {
    expect(normaliseUnit(' G ')).toBe('g');
    expect(normaliseUnit('Tbsp.')).toBe('tbsp');
  });

  it('resolves aliases to the canonical unit', () => {
    expect(findUnit('grams')?.key).toBe('g');
    expect(findUnit('lbs')?.key).toBe('lb');
    expect(findUnit('litres')?.key).toBe('l');
    expect(findUnit('pieces')?.key).toBe('each');
  });

  it('reports the dimension', () => {
    expect(unitDimension('kg')).toBe('MASS');
    expect(unitDimension('tsp')).toBe('VOLUME');
    expect(unitDimension('each')).toBe('COUNT');
    expect(unitDimension('nonsense')).toBeUndefined();
  });
});

describe('convert', () => {
  it('converts within mass', () => {
    expect(convert(1, 'kg', 'g')).toBe(1000);
    expect(convert(500, 'g', 'kg')).toBe(0.5);
    expect(round(convert(1, 'lb', 'g')!, 2)).toBe(453.59);
  });

  it('converts within volume', () => {
    expect(convert(1, 'l', 'ml')).toBe(1000);
    expect(round(convert(1, 'tbsp', 'tsp')!, 4)).toBe(3);
  });

  it('refuses to cross dimensions rather than returning a wrong number', () => {
    expect(convert(100, 'g', 'ml')).toBeNull();
    expect(convert(2, 'each', 'g')).toBeNull();
  });

  it('passes through identical unknown units', () => {
    expect(convert(3, 'sachet', 'sachet')).toBe(3);
    expect(convert(3, 'sachet', 'g')).toBeNull();
  });
});

describe('areUnitsCompatible', () => {
  it('accepts different units of the same dimension', () => {
    expect(areUnitsCompatible('g', 'kg')).toBe(true);
    expect(areUnitsCompatible('ml', 'tsp')).toBe(true);
  });

  it('rejects units of different dimensions', () => {
    expect(areUnitsCompatible('g', 'ml')).toBe(false);
    expect(areUnitsCompatible('each', 'g')).toBe(false);
  });
});

describe('toBase', () => {
  it('reduces to the dimension base unit', () => {
    expect(toBase(2, 'kg')).toEqual({ quantity: 2000, unit: 'g' });
    expect(toBase(1.5, 'l')).toEqual({ quantity: 1500, unit: 'ml' });
    expect(toBase(3, 'unknown-unit')).toBeNull();
  });
});

describe('round', () => {
  it('avoids floating point artefacts', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(0.1 + 0.2, 2)).toBe(0.3);
    expect(round(Number.NaN)).toBe(0);
  });
});

describe('humaniseQuantity', () => {
  it('scales large masses and volumes up', () => {
    expect(humaniseQuantity(1500, 'g')).toEqual({ quantity: 1.5, unit: 'kg' });
    expect(humaniseQuantity(2000, 'ml')).toEqual({ quantity: 2, unit: 'L' });
  });

  it('leaves small amounts and counts alone', () => {
    expect(humaniseQuantity(175, 'g')).toEqual({ quantity: 175, unit: 'g' });
    expect(humaniseQuantity(2, 'each')).toEqual({ quantity: 2, unit: 'each' });
  });
});

describe('formatQuantity', () => {
  it('renders counts as recipe fractions', () => {
    expect(formatQuantity(0.5, 'each')).toBe('1/2');
    expect(formatQuantity(2, 'each')).toBe('2');
    expect(formatQuantity(1.5, 'each')).toBe('1 1/2');
  });

  it('renders small volumes as fractions', () => {
    expect(formatQuantity(0.25, 'tsp')).toBe('1/4 tsp');
  });

  it('renders masses plainly', () => {
    expect(formatQuantity(175, 'g')).toBe('175 g');
  });

  it('pluralises named count units', () => {
    expect(formatQuantity(2, 'scoop')).toBe('2 scoops');
    expect(formatQuantity(1, 'scoop')).toBe('1 scoop');
  });
});

describe('formatAmount', () => {
  it('switches to kg past 1000 g', () => {
    expect(formatAmount(3266.7, 'g')).toBe('3.27 kg');
    expect(formatAmount(450, 'g')).toBe('450 g');
  });
});
