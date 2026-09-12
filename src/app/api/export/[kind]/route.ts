import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/db';
import { fromDbDate } from '@/lib/domain/dates';
import { exportBackup, toCsv } from '@/lib/server/backup';

/**
 * Download endpoints.
 *
 * These are HTTP routes rather than server actions because the browser needs to
 * save a file, which an action's response cannot do.
 */

export const dynamic = 'force-dynamic';

type Kind = 'backup' | 'meals' | 'water' | 'supplements' | 'groceries' | 'prep' | 'yields' | 'inventory';

const CSV_KINDS: Kind[] = ['meals', 'water', 'supplements', 'groceries', 'prep', 'yields', 'inventory'];

function filename(kind: string, extension: string): string {
  return `preptracker-${kind}-${new Date().toISOString().slice(0, 10)}.${extension}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await requireUser();
  const { kind } = await params;

  if (kind === 'backup') {
    const backup = await exportBackup(user.id);
    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename('backup', 'json')}"`,
      },
    });
  }

  if (!CSV_KINDS.includes(kind as Kind)) {
    return NextResponse.json({ error: 'Unknown export type.' }, { status: 404 });
  }

  const rows = await loadCsvRows(user.id, kind as Kind);

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename(kind, 'csv')}"`,
    },
  });
}

async function loadCsvRows(userId: string, kind: Kind): Promise<Array<Record<string, unknown>>> {
  switch (kind) {
    case 'meals': {
      const meals = await prisma.dailyMeal.findMany({
        where: { dailyPlan: { userId } },
        include: { dailyPlan: true, items: true },
        orderBy: [{ dailyPlan: { date: 'asc' } }, { sortOrder: 'asc' }],
      });
      return meals.map((meal) => ({
        date: fromDbDate(meal.dailyPlan.date),
        dayType: meal.dailyPlan.dayTypeName,
        meal: meal.name,
        scheduledTime: meal.scheduledTime ?? '',
        status: meal.status,
        completedAt: meal.completedAt?.toISOString() ?? '',
        items: meal.items.map((i) => `${i.foodName} ${i.quantity}${i.unit}`).join('; '),
        calories: meal.items.reduce((sum, i) => sum + (i.calories ?? 0), 0),
        protein: meal.items.reduce((sum, i) => sum + (i.protein ?? 0), 0),
        notes: meal.notes ?? '',
      }));
    }

    case 'water': {
      const entries = await prisma.waterEntry.findMany({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      return entries.map((entry) => ({
        date: fromDbDate(entry.date),
        amountMl: entry.amountMl,
        source: entry.source,
        loggedAt: entry.createdAt.toISOString(),
        note: entry.note ?? '',
      }));
    }

    case 'supplements': {
      const doses = await prisma.dailySupplement.findMany({
        where: { dailyPlan: { userId } },
        include: { dailyPlan: true },
        orderBy: [{ dailyPlan: { date: 'asc' } }, { sortOrder: 'asc' }],
      });
      return doses.map((dose) => ({
        date: fromDbDate(dose.dailyPlan.date),
        dayType: dose.dailyPlan.dayTypeName,
        supplement: dose.name,
        dosage: dose.dosageAmount != null ? `${dose.dosageAmount} ${dose.dosageUnit ?? ''}`.trim() : '',
        count: dose.countPerDose,
        form: dose.form,
        timing: dose.timingLabel,
        status: dose.status,
        completedAt: dose.completedAt?.toISOString() ?? '',
      }));
    }

    case 'groceries': {
      const items = await prisma.groceryItem.findMany({
        where: { groceryWeek: { userId } },
        include: { groceryWeek: true },
        orderBy: [{ groceryWeek: { startDate: 'asc' } }, { name: 'asc' }],
      });
      return items.map((item) => ({
        week: item.groceryWeek.name,
        startDate: fromDbDate(item.groceryWeek.startDate),
        item: item.name,
        category: item.category,
        department: item.department ?? '',
        requiredQty: item.requiredQty,
        requiredUnit: item.requiredUnit,
        shoppingQty: item.shoppingQty,
        shoppingUnit: item.shoppingUnit,
        cookedQty: item.cookedQty ?? '',
        rawQty: item.rawQty ?? '',
        yieldPct: item.yieldPctUsed ?? '',
        estimatedPackages: item.estimatedPackages ?? '',
        haveAlready: item.haveAlready,
        purchased: item.purchased,
      }));
    }

    case 'prep': {
      const batches = await prisma.prepBatch.findMany({
        where: { prepSession: { userId } },
        include: { prepSession: true },
        orderBy: { createdAt: 'asc' },
      });
      return batches.map((batch) => ({
        session: batch.prepSession.name,
        date: fromDbDate(batch.prepSession.date),
        food: batch.foodName,
        targetCookedG: batch.targetCookedG ?? '',
        rawWeightG: batch.rawWeightG ?? '',
        cookedWeightG: batch.cookedWeightG ?? '',
        measuredYieldPct: batch.measuredYieldPct ?? '',
        portionSizeG: batch.portionSizeG,
        portionsPlanned: batch.portionsPlanned ?? '',
        portionsMade: batch.portionsMade ?? '',
        containersPrepared: batch.containersPrepared ?? '',
      }));
    }

    case 'yields': {
      const yields = await prisma.cookingYield.findMany({
        where: { userId },
        orderBy: { recordedAt: 'asc' },
      });
      return yields.map((row) => ({
        food: row.foodName,
        yieldPct: row.yieldPct,
        source: row.source,
        rawWeightG: row.rawWeightG ?? '',
        cookedWeightG: row.cookedWeightG ?? '',
        recordedAt: row.recordedAt.toISOString(),
        note: row.note ?? '',
      }));
    }

    case 'inventory': {
      const items = await prisma.inventoryItem.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });
      return items.map((item) => ({
        item: item.name,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location,
        lowStockThreshold: item.lowStockThreshold ?? '',
        expiresOn: item.expiresOn ? fromDbDate(item.expiresOn) : '',
        notes: item.notes ?? '',
      }));
    }

    default:
      // Unreachable: the caller checks `kind` against CSV_KINDS first.
      return [];
  }
}
