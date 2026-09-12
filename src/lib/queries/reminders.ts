import 'server-only';

import { prisma } from '@/lib/db';
import { fromDbDate, toDbDate, type DayKey } from '@/lib/domain/dates';
import { buildReminders, type Reminder } from '@/lib/domain/reminders';
import { currentTimeString } from '@/lib/domain/time';
import type { DayView } from './day';

/**
 * Gathers the state the reminder rules need. Kept separate from the rules
 * themselves so a future scheduler can reuse either half.
 */
export async function getReminders(userId: string, day: DayView, today: DayKey): Promise<Reminder[]> {
  const [portions, prepSession, groceryWeek, lowStock] = await Promise.all([
    prisma.storagePortion.findMany({
      where: { userId, status: { in: ['FROZEN', 'THAWING'] } },
      select: { id: true, label: true, thawOn: true, status: true },
      take: 20,
    }),
    prisma.prepSession.findFirst({
      where: { userId, status: { in: ['PLANNED', 'IN_PROGRESS'] }, date: { gte: toDbDate(today) } },
      orderBy: { date: 'asc' },
      select: { id: true, name: true, date: true },
    }),
    prisma.groceryWeek.findFirst({
      where: { userId, status: { in: ['DRAFT', 'ACTIVE'] } },
      orderBy: { startDate: 'desc' },
      select: {
        id: true,
        name: true,
        startDate: true,
        _count: { select: { items: { where: { purchased: false, haveAlready: false } } } },
      },
    }),
    prisma.inventoryItem.findMany({
      where: { userId, lowStockThreshold: { not: null } },
      select: { id: true, name: true, quantity: true, unit: true, lowStockThreshold: true },
    }),
  ]);

  return buildReminders({
    nowTime: currentTimeString(),
    today,
    meals: day.meals.map((m) => ({
      id: m.id,
      name: m.name,
      status: m.status,
      scheduledTime: m.scheduledTime,
    })),
    supplements: day.supplements.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      timeOfDay: s.timeOfDay,
      timingLabel: s.timingLabel,
    })),
    water: { totalMl: day.water.totalMl, targetMl: day.water.targetMl },
    storage: portions.map((p) => ({
      id: p.id,
      label: p.label,
      thawOn: p.thawOn ? fromDbDate(p.thawOn) : null,
      status: p.status,
    })),
    prepSession: prepSession
      ? { id: prepSession.id, name: prepSession.name, date: fromDbDate(prepSession.date) }
      : null,
    groceryWeek: groceryWeek
      ? {
          id: groceryWeek.id,
          name: groceryWeek.name,
          remaining: groceryWeek._count.items,
          startDate: fromDbDate(groceryWeek.startDate),
        }
      : null,
    // The reminder rules collapse these into a single entry, so a fresh install
    // with every item at zero does not bury the reminders that matter.
    lowStock: lowStock
      .filter((item) => item.lowStockThreshold != null && item.quantity <= item.lowStockThreshold)
      .map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit })),
  });
}
