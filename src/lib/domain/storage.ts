/**
 * Fridge / freezer planning.
 *
 * The workflow this supports: cook once, keep the next few days in the fridge,
 * freeze the rest, and move tomorrow's portions down to thaw the night before.
 */

import { addDays, diffDays, type DayKey } from './dates';

export type StorageLocationKey = 'PANTRY' | 'FRIDGE' | 'FREEZER';
export type PortionStatusKey = 'READY' | 'FROZEN' | 'THAWING' | 'CONSUMED' | 'DISCARDED';

export interface StorageSettings {
  /** How many days of cooked food you are happy to keep refrigerated. */
  fridgeDays: number;
  /** How long a frozen portion needs in the fridge before it is eaten. */
  freezerThawLeadDays: number;
}

export interface PortionAllocation {
  location: StorageLocationKey;
  status: PortionStatusKey;
  portions: number;
  /** The day these portions are intended to be eaten, when known. */
  useByDate: DayKey;
  thawOn: DayKey | null;
  freezeOn: DayKey | null;
  refrigerateOn: DayKey | null;
}

/**
 * Split a freshly cooked batch between fridge and freezer.
 *
 * With the default `fridgeDays = 3`, cooking 7 portions on a Sunday puts
 * Sunday–Tuesday in the fridge and freezes Wednesday–Saturday, each with a thaw
 * date one day before it is needed.
 */
export function allocatePortions(
  prepDate: DayKey,
  portions: number,
  portionsPerDay: number,
  settings: StorageSettings,
): PortionAllocation[] {
  const total = Math.max(0, Math.floor(portions));
  const perDay = Math.max(1, portionsPerDay);
  if (total === 0) return [];

  const fridgeDays = Math.max(0, Math.floor(settings.fridgeDays));
  const lead = Math.max(0, Math.floor(settings.freezerThawLeadDays));

  const allocations: PortionAllocation[] = [];
  let remaining = total;
  let dayOffset = 0;

  while (remaining > 0) {
    const count = Math.min(perDay, remaining);
    const useByDate = addDays(prepDate, dayOffset);
    const inFridge = dayOffset < fridgeDays;

    allocations.push(
      inFridge
        ? {
            location: 'FRIDGE',
            status: 'READY',
            portions: count,
            useByDate,
            thawOn: null,
            freezeOn: null,
            refrigerateOn: prepDate,
          }
        : {
            location: 'FREEZER',
            status: 'FROZEN',
            portions: count,
            useByDate,
            thawOn: addDays(useByDate, -lead),
            freezeOn: prepDate,
            refrigerateOn: null,
          },
    );

    remaining -= count;
    dayOffset += 1;
  }

  return allocations;
}

export interface StoredPortionLike {
  id: string;
  label: string;
  portions: number;
  location: StorageLocationKey;
  status: PortionStatusKey;
  prepDate: DayKey;
  thawOn: DayKey | null;
  useByDate: DayKey | null;
}

export type StorageActionKind =
  | 'EAT_FIRST'
  | 'MOVE_TO_FRIDGE'
  | 'THAWING'
  | 'READY'
  | 'EXPIRED'
  | 'EXPIRING_SOON';

export interface StorageAction {
  kind: StorageActionKind;
  portion: StoredPortionLike;
  message: string;
  /** Lower sorts first on the dashboard. */
  priority: number;
}

/**
 * What the storage dashboard should tell you right now.
 *
 * The headline case is "move tomorrow's meals from the freezer to the fridge":
 * any frozen portion whose thaw date has arrived.
 */
export function storageActions(
  portions: readonly StoredPortionLike[],
  today: DayKey,
): StorageAction[] {
  const actions: StorageAction[] = [];

  for (const portion of portions) {
    if (portion.status === 'CONSUMED' || portion.status === 'DISCARDED') continue;

    const daysToUseBy = portion.useByDate ? diffDays(portion.useByDate, today) : null;

    if (portion.status === 'FROZEN' && portion.thawOn) {
      const daysToThaw = diffDays(portion.thawOn, today);
      if (daysToThaw <= 0) {
        actions.push({
          kind: 'MOVE_TO_FRIDGE',
          portion,
          message:
            daysToThaw < 0
              ? `Move ${portion.label} to the fridge — it was due to start thawing ${Math.abs(daysToThaw)} day${Math.abs(daysToThaw) === 1 ? '' : 's'} ago.`
              : `Move ${portion.label} from the freezer to the fridge tonight.`,
          priority: daysToThaw < 0 ? 0 : 1,
        });
        continue;
      }
    }

    if (portion.status === 'THAWING') {
      actions.push({
        kind: 'THAWING',
        portion,
        message: `${portion.label} is thawing in the fridge${portion.useByDate ? ` for ${portion.useByDate}` : ''}.`,
        priority: 3,
      });
      continue;
    }

    if (daysToUseBy !== null && portion.location === 'FRIDGE') {
      if (daysToUseBy < 0) {
        actions.push({
          kind: 'EXPIRED',
          portion,
          message: `${portion.label} was due ${Math.abs(daysToUseBy)} day${Math.abs(daysToUseBy) === 1 ? '' : 's'} ago. Check it before eating.`,
          priority: 0,
        });
        continue;
      }
      if (daysToUseBy === 0) {
        actions.push({
          kind: 'EAT_FIRST',
          portion,
          message: `Eat ${portion.label} today.`,
          priority: 1,
        });
        continue;
      }
      if (daysToUseBy === 1) {
        actions.push({
          kind: 'EXPIRING_SOON',
          portion,
          message: `${portion.label} should be eaten by tomorrow.`,
          priority: 2,
        });
        continue;
      }
    }

    if (portion.location === 'FRIDGE' && portion.status === 'READY') {
      actions.push({
        kind: 'READY',
        portion,
        message: `${portion.label} is ready in the fridge.`,
        priority: 4,
      });
    }
  }

  return actions.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.portion.label.localeCompare(b.portion.label);
  });
}

/** "Eat first" ordering: oldest prep date, then soonest use-by. */
export function eatFirstOrder(portions: readonly StoredPortionLike[]): StoredPortionLike[] {
  return [...portions]
    .filter((p) => p.status !== 'CONSUMED' && p.status !== 'DISCARDED')
    .sort((a, b) => {
      if (a.location !== b.location) return a.location === 'FRIDGE' ? -1 : 1;
      const useBy = (a.useByDate ?? '9999-12-31').localeCompare(b.useByDate ?? '9999-12-31');
      if (useBy !== 0) return useBy;
      return a.prepDate.localeCompare(b.prepDate);
    });
}

export interface StorageSummary {
  fridgePortions: number;
  freezerPortions: number;
  thawingPortions: number;
  moveToFridgeCount: number;
  eatTodayCount: number;
  expiredCount: number;
}

export function summariseStorage(
  portions: readonly StoredPortionLike[],
  today: DayKey,
): StorageSummary {
  const actions = storageActions(portions, today);
  const live = portions.filter((p) => p.status !== 'CONSUMED' && p.status !== 'DISCARDED');
  const count = (predicate: (p: StoredPortionLike) => boolean) =>
    live.filter(predicate).reduce((sum, p) => sum + p.portions, 0);

  return {
    fridgePortions: count((p) => p.location === 'FRIDGE'),
    freezerPortions: count((p) => p.location === 'FREEZER'),
    thawingPortions: count((p) => p.status === 'THAWING'),
    moveToFridgeCount: actions.filter((a) => a.kind === 'MOVE_TO_FRIDGE').length,
    eatTodayCount: actions.filter((a) => a.kind === 'EAT_FIRST').length,
    expiredCount: actions.filter((a) => a.kind === 'EXPIRED').length,
  };
}

/** Suggested use-by date for a freshly cooked batch kept in the fridge. */
export function suggestedUseBy(
  prepDate: DayKey,
  location: StorageLocationKey,
  settings: StorageSettings,
): DayKey {
  if (location === 'FREEZER') return addDays(prepDate, 90);
  if (location === 'FRIDGE') return addDays(prepDate, Math.max(1, settings.fridgeDays));
  return addDays(prepDate, 180);
}
