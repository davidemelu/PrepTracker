/**
 * Reminder descriptors.
 *
 * Deliberately a pure function returning plain objects. Today the Today screen
 * renders these as in-app badges. Adding browser notifications, or later a
 * server-side scheduler with Web Push, means consuming the same descriptors
 * from a different transport — no reminder logic has to move.
 */

import { diffDays, type DayKey } from './dates';
import { formatDuration, overdueByMinutes, relativeMinutes, OVERDUE_WINDOW_MINUTES } from './time';

export type ReminderKind =
  | 'MEAL_DUE'
  | 'MEAL_OVERDUE'
  | 'SUPPLEMENT_DUE'
  | 'WATER_BEHIND'
  | 'MOVE_TO_FRIDGE'
  | 'PREP_DAY'
  | 'GROCERY_SHOP'
  | 'LOW_STOCK';

export type ReminderSeverity = 'info' | 'due' | 'overdue';

export interface Reminder {
  id: string;
  kind: ReminderKind;
  severity: ReminderSeverity;
  title: string;
  body?: string;
  /** Where tapping the reminder should go. */
  href?: string;
  /** Sort key; lower is more urgent. */
  priority: number;
}

export interface ReminderContext {
  nowTime: string;
  today: DayKey;
  meals: ReadonlyArray<{
    id: string;
    name: string;
    status: string;
    scheduledTime: string | null;
  }>;
  supplements: ReadonlyArray<{
    id: string;
    name: string;
    status: string;
    timeOfDay: string | null;
    timingLabel: string;
  }>;
  water: { totalMl: number; targetMl: number };
  storage: ReadonlyArray<{ id: string; label: string; thawOn: DayKey | null; status: string }>;
  /** Next planned prep session, if any. */
  prepSession?: { id: string; name: string; date: DayKey } | null;
  /** Active grocery week with unpurchased items, if any. */
  groceryWeek?: { id: string; name: string; remaining: number; startDate: DayKey } | null;
  lowStock?: ReadonlyArray<{ id: string; name: string; quantity: number; unit: string }>;
  /** Minutes before a meal at which it starts prompting. */
  mealLeadMinutes?: number;
}

/**
 * How far through the day we are, used to decide whether water is behind.
 * Returns 0..1 across the waking window rather than the calendar day, because
 * a plan that starts at 1pm should not be "behind" at 9am.
 */
function expectedWaterFraction(nowTime: string, firstMealTime = '08:00', lastHour = '22:00'): number {
  const elapsed = relativeMinutes(firstMealTime, nowTime, 0);
  const span = relativeMinutes(firstMealTime, lastHour, 0);
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, elapsed / span));
}

export function buildReminders(context: ReminderContext): Reminder[] {
  const reminders: Reminder[] = [];
  const lead = context.mealLeadMinutes ?? 15;

  for (const meal of context.meals) {
    if (meal.status !== 'PENDING' || !meal.scheduledTime) continue;
    // The same test Today's rows use, so a meal cannot be overdue on one screen
    // and merely upcoming on the other.
    const lateBy = overdueByMinutes(context.nowTime, meal.scheduledTime);
    const delta = relativeMinutes(context.nowTime, meal.scheduledTime, OVERDUE_WINDOW_MINUTES);

    if (lateBy !== null) {
      reminders.push({
        id: `meal-overdue-${meal.id}`,
        kind: 'MEAL_OVERDUE',
        severity: 'overdue',
        title: `${meal.name} is overdue`,
        body: `Scheduled ${formatDuration(-lateBy)}.`,
        href: '/today',
        priority: 0,
      });
    } else if (delta >= 0 && delta <= lead) {
      reminders.push({
        id: `meal-due-${meal.id}`,
        kind: 'MEAL_DUE',
        severity: 'due',
        title: `${meal.name} in ${formatDuration(delta)}`,
        href: '/today',
        priority: 1,
      });
    }
  }

  for (const supplement of context.supplements) {
    if (supplement.status !== 'PENDING' || !supplement.timeOfDay) continue;
    const delta = relativeMinutes(context.nowTime, supplement.timeOfDay);
    if (delta < 0 && delta > -12 * 60) {
      reminders.push({
        id: `supp-${supplement.id}`,
        kind: 'SUPPLEMENT_DUE',
        severity: 'due',
        title: `${supplement.name} not taken`,
        body: supplement.timingLabel,
        href: '/today',
        priority: 2,
      });
    }
  }

  if (context.water.targetMl > 0) {
    const fraction = expectedWaterFraction(context.nowTime);
    const expected = context.water.targetMl * fraction;
    const behindMl = expected - context.water.totalMl;
    // Only nag once you are a meaningful amount behind pace.
    if (behindMl > context.water.targetMl * 0.15) {
      reminders.push({
        id: 'water-behind',
        kind: 'WATER_BEHIND',
        severity: 'due',
        title: 'Water is behind pace',
        body: `${Math.round(behindMl)} mL behind where you would normally be by now.`,
        href: '/today',
        priority: 3,
      });
    }
  }

  for (const portion of context.storage) {
    if (portion.status !== 'FROZEN' || !portion.thawOn) continue;
    const days = diffDays(portion.thawOn, context.today);
    if (days <= 0) {
      reminders.push({
        id: `thaw-${portion.id}`,
        kind: 'MOVE_TO_FRIDGE',
        severity: days < 0 ? 'overdue' : 'due',
        title: 'Move food to the fridge',
        body: `${portion.label} needs to start thawing${days < 0 ? ' (overdue)' : ' tonight'}.`,
        href: '/prep/storage',
        priority: days < 0 ? 1 : 2,
      });
    }
  }

  if (context.prepSession) {
    const days = diffDays(context.prepSession.date, context.today);
    if (days === 0) {
      reminders.push({
        id: `prep-${context.prepSession.id}`,
        kind: 'PREP_DAY',
        severity: 'due',
        title: 'Prep day is today',
        body: context.prepSession.name,
        href: `/prep/${context.prepSession.id}`,
        priority: 2,
      });
    } else if (days === 1) {
      reminders.push({
        id: `prep-${context.prepSession.id}`,
        kind: 'PREP_DAY',
        severity: 'info',
        title: 'Prep day tomorrow',
        body: context.prepSession.name,
        href: `/prep/${context.prepSession.id}`,
        priority: 5,
      });
    }
  }

  if (context.groceryWeek && context.groceryWeek.remaining > 0) {
    const days = diffDays(context.groceryWeek.startDate, context.today);
    if (days <= 1) {
      reminders.push({
        id: `grocery-${context.groceryWeek.id}`,
        kind: 'GROCERY_SHOP',
        severity: days < 0 ? 'due' : 'info',
        title: `${context.groceryWeek.remaining} item${context.groceryWeek.remaining === 1 ? '' : 's'} left to buy`,
        body: context.groceryWeek.name,
        href: '/groceries',
        priority: 6,
      });
    }
  }

  // Collapsed into a single reminder: a fresh install has every inventory item
  // at zero, and three identical cards would bury everything above them.
  const lowStock = context.lowStock ?? [];
  if (lowStock.length > 0) {
    const names = lowStock.slice(0, 3).map((item) => item.name);
    const extra = lowStock.length - names.length;
    reminders.push({
      id: 'low-stock',
      kind: 'LOW_STOCK',
      severity: 'info',
      title:
        lowStock.length === 1
          ? `Low stock: ${names[0]}`
          : `${lowStock.length} items low on stock`,
      body: lowStock.length === 1 ? undefined : `${names.join(', ')}${extra > 0 ? ` and ${extra} more` : ''}`,
      href: '/more/inventory',
      priority: 7,
    });
  }

  return reminders.sort((a, b) => a.priority - b.priority);
}

export const SEVERITY_ORDER: Record<ReminderSeverity, number> = {
  overdue: 0,
  due: 1,
  info: 2,
};

/** The single most urgent reminder, for the compact Today banner. */
export function topReminder(reminders: readonly Reminder[]): Reminder | null {
  if (reminders.length === 0) return null;
  return [...reminders].sort((a, b) => {
    const sa = SEVERITY_ORDER[a.severity];
    const sb = SEVERITY_ORDER[b.severity];
    if (sa !== sb) return sa - sb;
    return a.priority - b.priority;
  })[0]!;
}
