import { Droplets, Pill, Utensils } from 'lucide-react';
import { adherenceBand } from '@/lib/domain/adherence';
import { formatWater } from '@/lib/domain/water';
import { Card } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { cn } from '@/lib/utils';
import type { DayView } from '@/lib/queries/day';

const BAND_CLASS: Record<ReturnType<typeof adherenceBand>, string> = {
  great: 'stroke-success',
  good: 'stroke-primary',
  ok: 'stroke-warning',
  poor: 'stroke-destructive',
};

function Stat({
  icon: Icon,
  label,
  value,
  detail,
  percent,
}: {
  icon: typeof Droplets;
  label: string;
  value: string;
  detail: string;
  percent: number;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5">
      <ProgressRing
        value={percent}
        size={64}
        strokeWidth={6}
        indicatorClassName={BAND_CLASS[adherenceBand(percent)]}
      >
        <Icon className="size-4 text-muted-foreground" />
      </ProgressRing>
      <div className="text-center leading-tight">
        <p className="tabular text-sm font-semibold">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="sr-only">{detail}</p>
      </div>
    </div>
  );
}

/**
 * The "how is today going" strip. Designed to answer the question at a glance
 * without scrolling: three rings plus one overall number.
 */
export function DaySummary({ day }: { day: DayView }) {
  const { adherence, water } = day;
  const band = adherenceBand(adherence.overallPercent);

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4">
        <ProgressRing
          value={adherence.overallPercent}
          size={88}
          strokeWidth={8}
          indicatorClassName={BAND_CLASS[band]}
          label={`${Math.round(adherence.overallPercent)}%`}
          sublabel="COMPLETE"
        />

        <div className="grid flex-1 grid-cols-3 gap-1">
          <Stat
            icon={Utensils}
            label="Meals"
            value={`${adherence.meals.completed}/${adherence.meals.total}`}
            detail={`${adherence.meals.percent}% of meals eaten`}
            percent={adherence.meals.percent}
          />
          <Stat
            icon={Droplets}
            label="Water"
            value={formatWater(water.totalMl)}
            detail={`${water.percent}% of your ${formatWater(water.targetMl)} target`}
            percent={water.percentCapped}
          />
          <Stat
            icon={Pill}
            label="Supps"
            value={`${adherence.supplements.completed}/${adherence.supplements.total}`}
            detail={`${adherence.supplements.percent}% of supplements taken`}
            percent={adherence.supplements.percent}
          />
        </div>
      </div>

      {day.macros.calories != null ? (
        <p className={cn('mt-3 border-t border-border pt-2 text-center text-xs text-muted-foreground')}>
          <span className="tabular font-medium text-foreground">{Math.round(day.macros.calories)}</span> kcal ·{' '}
          <span className="tabular font-medium text-foreground">{Math.round(day.macros.protein ?? 0)}</span>P ·{' '}
          <span className="tabular font-medium text-foreground">{Math.round(day.macros.carbs ?? 0)}</span>C ·{' '}
          <span className="tabular font-medium text-foreground">{Math.round(day.macros.fat ?? 0)}</span>F
          {day.macros.missing.length > 0 ? ` · ${day.macros.missing.length} without nutrition data` : ''}
        </p>
      ) : null}
    </Card>
  );
}
