'use client';

import Link from 'next/link';
import { adherenceBand } from '@/lib/domain/adherence';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * History, split by the thing you want to look back at. Every row links to the
 * day or session it came from, and nothing here is recomputed — these are the
 * records as they were saved.
 */

interface DayRow {
  date: string;
  label: string;
  dayTypeName: string;
  isTraining: boolean;
  mealsCompleted: number;
  mealsTotal: number;
  supplementsCompleted: number;
  supplementsTotal: number;
  water: string;
  waterPercent: number;
  overall: number;
  notes: string | null;
}

interface GroceryWeekRow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  total: number;
  done: number;
}

interface PrepSessionRow {
  id: string;
  name: string;
  date: string;
  status: string;
  daysCovered: number;
  batches: Array<{ foodName: string; measuredYieldPct: number | null; portionsMade: number | null }>;
}

interface YieldRow {
  foodName: string;
  averagePct: number;
  currentPct: number | null;
  points: Array<{ date: string; yieldPct: number; source: string }>;
}

interface CheckInRow {
  date: string;
  dayTypeName: string;
  hunger: number | null;
  energy: number | null;
  training: number | null;
  adherence: number | null;
  notes: string | null;
  digestionNote: string | null;
  workoutNote: string | null;
  mealDifficultyNote: string | null;
  prepIssueNote: string | null;
}

const BAND_TEXT = {
  great: 'text-success',
  good: 'text-primary',
  ok: 'text-warning',
  poor: 'text-destructive',
} as const;

export function HistoryTabs({
  days,
  groceryWeeks,
  prepSessions,
  yields,
  checkIns,
}: {
  days: DayRow[];
  groceryWeeks: GroceryWeekRow[];
  prepSessions: PrepSessionRow[];
  yields: YieldRow[];
  checkIns: CheckInRow[];
}) {
  return (
    <Tabs defaultValue="days">
      <TabsList>
        <TabsTrigger value="days">Days</TabsTrigger>
        <TabsTrigger value="groceries">Groceries</TabsTrigger>
        <TabsTrigger value="prep">Prep</TabsTrigger>
        <TabsTrigger value="yields">Yields</TabsTrigger>
        <TabsTrigger value="checkins">Check-ins</TabsTrigger>
      </TabsList>

      {/* Days ------------------------------------------------------------- */}
      <TabsContent value="days" className="space-y-2">
        {days.length === 0 ? (
          <EmptyState title="No tracked days in this period" />
        ) : (
          <Card className="divide-y divide-border">
            {days.map((day) => (
              <Link
                key={day.date}
                href={`/today?date=${day.date}`}
                prefetch={false}
                className="flex items-center gap-3 p-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium leading-tight">{day.label}</span>
                    <Badge variant={day.isTraining ? 'training' : 'rest'}>{day.dayTypeName}</Badge>
                  </span>
                  <span className="tabular block text-xs text-muted-foreground">
                    {day.mealsCompleted}/{day.mealsTotal} meals · {day.supplementsCompleted}/
                    {day.supplementsTotal} supps · {day.water}
                  </span>
                  {day.notes ? (
                    <span className="block truncate text-xs text-muted-foreground">{day.notes}</span>
                  ) : null}
                </span>
                <span
                  className={cn(
                    'tabular shrink-0 text-base font-bold',
                    BAND_TEXT[adherenceBand(day.overall)],
                  )}
                >
                  {Math.round(day.overall)}%
                </span>
              </Link>
            ))}
          </Card>
        )}
      </TabsContent>

      {/* Groceries -------------------------------------------------------- */}
      <TabsContent value="groceries" className="space-y-2">
        {groceryWeeks.length === 0 ? (
          <EmptyState title="No grocery lists yet" />
        ) : (
          <Card className="divide-y divide-border">
            {groceryWeeks.map((week) => (
              <Link
                key={week.id}
                href={`/groceries/${week.id}`}
                className="flex items-center gap-3 p-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-medium leading-tight">{week.name}</span>
                  <span className="tabular block text-xs text-muted-foreground">
                    {week.startDate} → {week.endDate} · {week.done}/{week.total} sorted
                  </span>
                </span>
                <Badge variant={week.status === 'COMPLETED' ? 'success' : 'secondary'}>
                  {week.status.charAt(0) + week.status.slice(1).toLowerCase()}
                </Badge>
              </Link>
            ))}
          </Card>
        )}
      </TabsContent>

      {/* Prep ------------------------------------------------------------- */}
      <TabsContent value="prep" className="space-y-2">
        {prepSessions.length === 0 ? (
          <EmptyState title="No prep sessions yet" />
        ) : (
          <Card className="divide-y divide-border">
            {prepSessions.map((session) => (
              <Link
                key={session.id}
                href={`/prep/${session.id}`}
                className="block p-3 transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-accent/40"
              >
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-tight">{session.name}</span>
                    <span className="tabular block text-xs text-muted-foreground">
                      {session.date} · {session.daysCovered} days
                    </span>
                  </span>
                  <Badge variant={session.status === 'COMPLETED' ? 'success' : 'secondary'}>
                    {session.status === 'IN_PROGRESS'
                      ? 'In progress'
                      : session.status.charAt(0) + session.status.slice(1).toLowerCase()}
                  </Badge>
                </div>

                {session.batches.length > 0 ? (
                  <ul className="mt-1.5 space-y-0.5">
                    {session.batches.map((batch) => (
                      <li
                        key={`${session.id}-${batch.foodName}`}
                        className="tabular flex justify-between gap-2 text-xs text-muted-foreground"
                      >
                        <span>{batch.foodName}</span>
                        <span>
                          {batch.measuredYieldPct != null ? `${batch.measuredYieldPct}% yield` : 'not cooked'}
                          {batch.portionsMade != null ? ` · ${batch.portionsMade} portions` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Link>
            ))}
          </Card>
        )}
      </TabsContent>

      {/* Yields ----------------------------------------------------------- */}
      <TabsContent value="yields" className="space-y-2">
        {yields.length === 0 ? (
          <EmptyState title="No yield measurements yet" />
        ) : (
          yields.map((row) => (
            <Card key={row.foodName} className="p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{row.foodName}</span>
                <span className="tabular text-sm">
                  now <span className="font-semibold">{row.currentPct ?? '—'}%</span>
                </span>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {row.points
                  .slice()
                  .reverse()
                  .slice(0, 10)
                  .map((point, index) => (
                    <li
                      key={`${row.foodName}-${point.date}-${index}`}
                      className="tabular flex justify-between gap-2 text-xs text-muted-foreground"
                    >
                      <span>{point.date}</span>
                      <span>{point.source.toLowerCase()}</span>
                      <span className="font-medium text-foreground">{point.yieldPct}%</span>
                    </li>
                  ))}
              </ul>
            </Card>
          ))
        )}
      </TabsContent>

      {/* Check-ins -------------------------------------------------------- */}
      <TabsContent value="checkins" className="space-y-2">
        {checkIns.length === 0 ? (
          <EmptyState
            title="No check-ins yet"
            description="Add one from the Today screen to track hunger, energy and training."
          />
        ) : (
          checkIns
            .slice()
            .reverse()
            .map((checkIn) => (
              <Card key={checkIn.date} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <Link href={`/today?date=${checkIn.date}`} className="font-medium">
                    {checkIn.date}
                  </Link>
                  <Badge variant="outline">{checkIn.dayTypeName}</Badge>
                </div>

                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {(
                    [
                      ['Hunger', checkIn.hunger],
                      ['Energy', checkIn.energy],
                      ['Training', checkIn.training],
                      ['Adherence', checkIn.adherence],
                    ] as const
                  )
                    .filter(([, value]) => value != null)
                    .map(([label, value]) => (
                      <span
                        key={label}
                        className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {label} {value}/5
                      </span>
                    ))}
                </div>

                {[
                  checkIn.notes,
                  checkIn.digestionNote && `Digestion: ${checkIn.digestionNote}`,
                  checkIn.workoutNote && `Workout: ${checkIn.workoutNote}`,
                  checkIn.mealDifficultyNote && `Meals: ${checkIn.mealDifficultyNote}`,
                  checkIn.prepIssueNote && `Prep: ${checkIn.prepIssueNote}`,
                ]
                  .filter(Boolean)
                  .map((note) => (
                    <p key={note as string} className="mt-1 text-xs text-muted-foreground">
                      {note}
                    </p>
                  ))}
              </Card>
            ))
        )}
      </TabsContent>
    </Tabs>
  );
}
