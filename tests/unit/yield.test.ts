import { describe, expect, it } from 'vitest';
import {
  buildMeatRequirement,
  cookedToRaw,
  effectiveYield,
  measureYield,
  planPortions,
  rawToCooked,
  validateYieldPct,
} from '@/lib/domain/yield';
import { round } from '@/lib/domain/units';

describe('cookedToRaw', () => {
  it('matches the worked example for meals 2 and 4', () => {
    // 175 g cooked x 2 servings x 7 days = 2450 g cooked chicken.
    const cooked = 175 * 2 * 7;
    expect(cooked).toBe(2450);
    // At a 75% yield that needs 3266.7 g of raw chicken.
    expect(round(cookedToRaw(cooked, 75), 1)).toBe(3266.7);
  });

  it('matches the worked example for meal 5', () => {
    const cooked = 175 * 1 * 7;
    expect(cooked).toBe(1225);
    expect(round(cookedToRaw(cooked, 75), 1)).toBe(1633.3);
    expect(round(cookedToRaw(cooked, 80), 1)).toBe(1531.3);
  });

  it('handles foods that gain weight, such as rice', () => {
    // 100 g dry rice yields roughly 300 g cooked, so 3700 g cooked needs
    // 1233.3 g of dry rice.
    expect(round(cookedToRaw(3700, 300), 1)).toBe(1233.3);
  });

  it('refuses a zero or negative yield instead of dividing by zero', () => {
    expect(() => cookedToRaw(1000, 0)).toThrow(/greater than 0/);
    expect(() => cookedToRaw(1000, -10)).toThrow(/greater than 0/);
  });
});

describe('rawToCooked', () => {
  it('is the inverse of cookedToRaw', () => {
    const raw = cookedToRaw(2450, 75);
    expect(round(rawToCooked(raw, 75), 1)).toBe(2450);
  });

  it('converts a real batch', () => {
    expect(rawToCooked(1000, 75)).toBe(750);
  });
});

describe('measureYield', () => {
  it('computes the actual yield of a batch', () => {
    expect(measureYield(2000, 1500)).toBe(75);
    expect(measureYield(1000, 780)).toBe(78);
  });

  it('rejects a zero raw weight', () => {
    expect(() => measureYield(0, 500)).toThrow(/greater than 0/);
  });

  it('rejects a negative cooked weight', () => {
    expect(() => measureYield(1000, -1)).toThrow(/cannot be negative/);
  });
});

describe('validateYieldPct', () => {
  it('rejects zero and negative yields', () => {
    expect(validateYieldPct(0).ok).toBe(false);
    expect(validateYieldPct(-5).ok).toBe(false);
  });

  it('accepts a normal meat yield without confirmation', () => {
    const result = validateYieldPct(75);
    expect(result.ok).toBe(true);
    expect(result.needsConfirmation).toBe(false);
  });

  it('allows above 100% but asks for confirmation', () => {
    const result = validateYieldPct(300);
    expect(result.ok).toBe(true);
    expect(result.needsConfirmation).toBe(true);
    expect(result.message).toMatch(/gains weight/);
  });

  it('rejects absurd values outright', () => {
    expect(validateYieldPct(5000).ok).toBe(false);
    expect(validateYieldPct(Number.NaN).ok).toBe(false);
  });
});

describe('planPortions', () => {
  it('floors to whole portions and reports leftovers', () => {
    const plan = planPortions(2500, 175);
    expect(plan.portions).toBe(14);
    expect(plan.leftoverG).toBe(50);
  });

  it('reports a shortfall against the target', () => {
    const plan = planPortions(2000, 175, 14);
    expect(plan.portions).toBe(11);
    expect(plan.shortfallPortions).toBe(3);
    expect(plan.shortfallG).toBe(525);
  });

  it('reports no shortfall when the batch is sufficient', () => {
    expect(planPortions(2450, 175, 14).shortfallPortions).toBe(0);
  });

  it('rejects a zero portion size', () => {
    expect(() => planPortions(1000, 0)).toThrow(/greater than 0/);
  });
});

describe('effectiveYield', () => {
  const at = (days: number) => new Date(Date.UTC(2026, 0, days));

  it('falls back to the seeded default when nothing is measured', () => {
    expect(effectiveYield([], 75)).toBe(75);
    expect(effectiveYield([{ yieldPct: 75, recordedAt: at(1), source: 'DEFAULT' }], 75)).toBe(75);
  });

  it('returns null when there is no default and no measurement', () => {
    expect(effectiveYield([], null)).toBeNull();
  });

  it('averages the most recent measurements', () => {
    const observations = [
      { yieldPct: 70, recordedAt: at(1), source: 'MEASURED' as const },
      { yieldPct: 80, recordedAt: at(2), source: 'MEASURED' as const },
    ];
    expect(effectiveYield(observations, 75)).toBe(75);
  });

  it('ignores measurements beyond the sample window', () => {
    const observations = [
      { yieldPct: 10, recordedAt: at(1), source: 'MEASURED' as const },
      { yieldPct: 80, recordedAt: at(2), source: 'MEASURED' as const },
      { yieldPct: 80, recordedAt: at(3), source: 'MEASURED' as const },
    ];
    expect(effectiveYield(observations, 75, 2)).toBe(80);
  });

  it('prefers measurements over the default', () => {
    const observations = [{ yieldPct: 82, recordedAt: at(5), source: 'MEASURED' as const }];
    expect(effectiveYield(observations, 75)).toBe(82);
  });
});

describe('buildMeatRequirement', () => {
  it('produces cooked and raw amounts plus a portion count', () => {
    const req = buildMeatRequirement({
      foodId: 'chicken',
      foodName: 'Chicken breast',
      cookedRequiredG: 2450,
      yieldPct: 75,
      portionSizeG: 175,
    });
    expect(req.cookedRequiredG).toBe(2450);
    expect(req.rawRequiredG).toBe(3266.7);
    expect(req.portionsRequired).toBe(14);
    expect(req.missingYield).toBe(false);
  });

  it('flags a missing yield instead of inventing one', () => {
    const req = buildMeatRequirement({
      foodId: 'lamb',
      foodName: 'Lamb',
      cookedRequiredG: 1000,
      yieldPct: null,
      portionSizeG: 175,
    });
    expect(req.rawRequiredG).toBeNull();
    expect(req.missingYield).toBe(true);
  });
});

describe('effectiveYield with a mix of sources', () => {
  const at = (day: number) => `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`;

  it('lets one weighed batch override a value set by hand', () => {
    // The point of measuring is that the scale wins. Averaging the two used to
    // give 76, which is neither the value typed nor the value observed.
    const value = effectiveYield(
      [
        { yieldPct: 82, recordedAt: at(12), source: 'MANUAL' },
        { yieldPct: 70, recordedAt: at(13), source: 'MEASURED' },
      ],
      75,
    );
    expect(value).toBe(70);
  });

  it('still averages several weighed batches', () => {
    const value = effectiveYield(
      [
        { yieldPct: 70, recordedAt: at(13), source: 'MEASURED' },
        { yieldPct: 74, recordedAt: at(14), source: 'MEASURED' },
      ],
      75,
    );
    expect(value).toBe(72);
  });

  it('uses the most recent hand-set value until something is weighed', () => {
    const value = effectiveYield(
      [
        { yieldPct: 80, recordedAt: at(12), source: 'MANUAL' },
        { yieldPct: 85, recordedAt: at(13), source: 'MANUAL' },
        { yieldPct: 75, recordedAt: at(11), source: 'DEFAULT' },
      ],
      75,
    );
    expect(value).toBe(85);
  });

  it('falls back to the seeded default when nothing else exists', () => {
    expect(effectiveYield([{ yieldPct: 75, recordedAt: at(11), source: 'DEFAULT' }], 75)).toBe(75);
  });
});
