import { describe, expect, it } from 'vitest';
import {
  averageDailyWater,
  formatWater,
  isProbableDuplicate,
  lastEntry,
  progressFromTotal,
  validateWaterAmount,
  waterAdherence,
  waterProgress,
} from '@/lib/domain/water';

const entry = (id: string, amountMl: number, secondsAgo: number) => ({
  id,
  amountMl,
  createdAt: new Date(Date.UTC(2026, 0, 1, 12, 0, 0) - secondsAgo * 1000),
});

describe('waterProgress', () => {
  it('totals entries against the target', () => {
    const progress = waterProgress([entry('a', 500, 60), entry('b', 250, 30)], 4000);
    expect(progress.totalMl).toBe(750);
    expect(progress.remainingMl).toBe(3250);
    expect(progress.percent).toBe(18.8);
    expect(progress.goalReached).toBe(false);
    expect(progress.entryCount).toBe(2);
  });

  it('caps the display percentage but keeps the true one', () => {
    const progress = waterProgress([entry('a', 4500, 10)], 4000);
    expect(progress.percent).toBe(112.5);
    expect(progress.percentCapped).toBe(100);
    expect(progress.goalReached).toBe(true);
    expect(progress.remainingMl).toBe(0);
  });

  it('handles an empty day', () => {
    const progress = waterProgress([], 4000);
    expect(progress.totalMl).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.remainingMl).toBe(4000);
  });

  it('does not divide by a zero target', () => {
    const progress = waterProgress([entry('a', 500, 5)], 0);
    expect(progress.percent).toBe(0);
    expect(progress.goalReached).toBe(false);
  });
});

describe('validateWaterAmount', () => {
  it('accepts the quick-add amounts', () => {
    expect(validateWaterAmount(250).ok).toBe(true);
    expect(validateWaterAmount(500).ok).toBe(true);
  });

  it('rejects zero and negative amounts', () => {
    expect(validateWaterAmount(0).ok).toBe(false);
    expect(validateWaterAmount(-250).ok).toBe(false);
    expect(validateWaterAmount(-250).message).toMatch(/greater than 0/);
  });

  it('rejects fractions of a millilitre and non-numbers', () => {
    expect(validateWaterAmount(250.5).ok).toBe(false);
    expect(validateWaterAmount(Number.NaN).ok).toBe(false);
  });

  it('rejects an implausibly large single entry', () => {
    expect(validateWaterAmount(9000).ok).toBe(false);
  });
});

describe('isProbableDuplicate', () => {
  const now = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));

  it('flags the same amount tapped twice in a few seconds', () => {
    expect(isProbableDuplicate([entry('a', 500, 3)], 500, now)).toBe(true);
  });

  it('allows the same amount later in the day', () => {
    expect(isProbableDuplicate([entry('a', 500, 300)], 500, now)).toBe(false);
  });

  it('allows a different amount immediately', () => {
    expect(isProbableDuplicate([entry('a', 500, 2)], 250, now)).toBe(false);
  });

  it('is false for the first entry of the day', () => {
    expect(isProbableDuplicate([], 500, now)).toBe(false);
  });
});

describe('lastEntry', () => {
  it('returns the most recent entry for undo', () => {
    const entries = [entry('old', 500, 600), entry('new', 250, 5), entry('mid', 250, 100)];
    expect(lastEntry(entries)?.id).toBe('new');
  });

  it('returns null when there is nothing to undo', () => {
    expect(lastEntry([])).toBeNull();
  });
});

describe('formatWater', () => {
  it('switches to litres past a litre', () => {
    expect(formatWater(2500)).toBe('2.5 L');
    expect(formatWater(4000)).toBe('4 L');
    expect(formatWater(750)).toBe('750 mL');
  });
});

describe('averageDailyWater and waterAdherence', () => {
  const days = [
    { date: '2026-01-01', totalMl: 4000, targetMl: 4000, percent: 100 },
    { date: '2026-01-02', totalMl: 2000, targetMl: 4000, percent: 50 },
    { date: '2026-01-03', totalMl: 6000, targetMl: 4000, percent: 150 },
  ];

  it('averages the daily totals', () => {
    expect(averageDailyWater(days)).toBe(4000);
    expect(averageDailyWater([])).toBe(0);
  });

  it('caps each day at 100% so one big day cannot mask a dry one', () => {
    // 100 + 50 + 100 over three days.
    expect(waterAdherence(days)).toBe(83.3);
  });

  it('scores a day with no target as met', () => {
    expect(waterAdherence([{ date: 'd', totalMl: 0, targetMl: 0, percent: 0 }])).toBe(100);
  });
});

describe('progressFromTotal', () => {
  it('describes a running total the same way a list of entries is described', () => {
    const fromEntries = waterProgress(
      [
        { id: 'a', amountMl: 250, createdAt: '2026-09-14T08:00:00.000Z' },
        { id: 'b', amountMl: 500, createdAt: '2026-09-14T09:00:00.000Z' },
      ],
      4000,
    );
    const fromTotal = progressFromTotal(750, 4000);

    expect(fromTotal.totalMl).toBe(fromEntries.totalMl);
    expect(fromTotal.percent).toBe(fromEntries.percent);
    expect(fromTotal.remainingMl).toBe(fromEntries.remainingMl);
    expect(fromTotal.goalReached).toBe(fromEntries.goalReached);
  });

  it('never reports a negative total or a negative remainder', () => {
    expect(progressFromTotal(-500, 4000).totalMl).toBe(0);
    expect(progressFromTotal(5000, 4000).remainingMl).toBe(0);
    expect(progressFromTotal(Number.NaN, 4000).totalMl).toBe(0);
  });

  it('reports nothing rather than everything when no target is set', () => {
    const progress = progressFromTotal(1000, 0);
    expect(progress.percent).toBe(0);
    expect(progress.goalReached).toBe(false);
  });
});
