'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/**
 * Charts for a phone screen.
 *
 * Rules applied throughout: one idea per chart, no legend where the title says
 * it, horizontal bars when labels are words, and axis text large enough to read
 * at arm's length. Colours come from the theme tokens so both themes work.
 *
 * Nothing here may be readable by colour alone. An SVG drawn by recharts has no
 * text a screen reader can follow and its fills mean nothing to anyone who
 * cannot separate the hues, so every chart is hidden from assistive technology
 * and publishes the same figures as the list underneath it. Where a series is
 * distinguished on the chart itself it is distinguished by shape — a dash
 * pattern, or a number printed on the bar — and not only by its colour.
 */

const AXIS = { fontSize: 11, fill: 'var(--muted-foreground)' };
const GRID = 'var(--border)';

function ChartFrame({ height = 200, children }: { height?: number; children: React.ReactElement }) {
  return (
    <div aria-hidden style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** The figures behind the picture, for anyone the picture does not serve. */
function Summary({ children }: { children: React.ReactNode }) {
  return <ul className="mt-3 space-y-1 border-t border-border pt-2 text-xs">{children}</ul>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-3">
      <span className="min-w-0 truncate">{label}</span>
      <span className="tabular shrink-0 text-muted-foreground">{value}</span>
    </li>
  );
}

/**
 * Recharts types its formatter value as `unknown`-ish, so these helpers coerce
 * once rather than sprinkling casts through every chart.
 */
const percentFormatter = (value: unknown) => `${Number(value)}%`;
const litresFormatter = (value: unknown) => `${Number(value)} L`;

const tooltipStyle = {
  contentStyle: {
    background: 'var(--popover)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    fontSize: 12,
    color: 'var(--popover-foreground)',
  },
  labelStyle: { color: 'var(--muted-foreground)', fontSize: 11 },
} as const;

export function WeeklyAdherenceChart({
  data,
}: {
  data: Array<{ label: string; overall: number; meals: number; water: number; supplements: number }>;
}) {
  return (
    <figure className="m-0">
      <ChartFrame>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={44} unit="%" />
          <Tooltip {...tooltipStyle} formatter={percentFormatter} />
          <ReferenceLine y={100} stroke={GRID} strokeDasharray="2 2" />
          {/* Solid, dashed and dotted, so the three series stay apart in greyscale. */}
          <Line
            type="monotone"
            dataKey="overall"
            name="Overall"
            stroke="var(--primary)"
            strokeWidth={2.5}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="meals"
            name="Meals"
            stroke="var(--success)"
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="water"
            name="Water"
            stroke="var(--rest)"
            strokeWidth={1.5}
            strokeDasharray="1 3"
            dot={false}
          />
        </LineChart>
      </ChartFrame>
      <Summary>
        {data.map((week) => (
          <SummaryRow
            key={week.label}
            label={week.label}
            value={`${Math.round(week.overall)}% overall · ${Math.round(week.meals)}% meals · ${Math.round(week.water)}% water`}
          />
        ))}
      </Summary>
    </figure>
  );
}

export function WaterTrendChart({
  data,
}: {
  data: Array<{ date: string; totalMl: number; targetMl: number }>;
}) {
  const target = data.at(-1)?.targetMl ?? 0;
  const onTarget = data.filter((d) => d.targetMl > 0 && d.totalMl >= d.targetMl).length;
  const average = data.length > 0 ? data.reduce((sum, d) => sum + d.totalMl, 0) / data.length : 0;
  const short = data.filter((d) => d.targetMl > 0 && d.totalMl < d.targetMl);

  return (
    <figure className="m-0">
      <ChartFrame>
        <BarChart
          data={data.map((d) => ({ ...d, label: d.date.slice(5), litres: +(d.totalMl / 1000).toFixed(2) }))}
          margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} unit="L" />
          <Tooltip {...tooltipStyle} formatter={litresFormatter} />
          {target > 0 ? (
            <ReferenceLine
              y={target / 1000}
              stroke="var(--primary)"
              strokeDasharray="4 4"
              label={{ value: 'target', position: 'insideTopRight', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
          ) : null}
          <Bar dataKey="litres" name="Water" radius={[4, 4, 0, 0]}>
            {data.map((d) => (
              <Cell
                key={d.date}
                fill={d.targetMl > 0 && d.totalMl >= d.targetMl ? 'var(--success)' : 'var(--rest)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ChartFrame>
      <Summary>
        <SummaryRow label="Days that reached the target" value={`${onTarget} of ${data.length}`} />
        <SummaryRow label="Average per day" value={`${(average / 1000).toFixed(1)} L`} />
        {short.length > 0 ? (
          <SummaryRow
            label="Short of target on"
            value={short.map((d) => d.date.slice(5)).join(', ')}
          />
        ) : null}
      </Summary>
    </figure>
  );
}

/**
 * The bands the fills stand for, in words. A fill that goes from green to red
 * says nothing to a viewer who cannot tell those apart, and nothing at all to
 * one who cannot see the chart.
 */
function band(percent: number): string {
  if (percent >= 95) return 'on track';
  if (percent >= 80) return 'good';
  if (percent >= 60) return 'patchy';
  return 'often missed';
}

export function CompletionByMealChart({
  data,
}: {
  data: Array<{ name: string; percent: number; completed: number; planned: number }>;
}) {
  return (
    <figure className="m-0">
      <ChartFrame height={Math.max(140, data.length * 40)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} unit="%" />
          <YAxis
            type="category"
            dataKey="name"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={72}
          />
          <Tooltip
            {...tooltipStyle}
            formatter={(value: unknown, _name: unknown, entry: unknown) => {
              const row = (entry as { payload?: { completed?: number; planned?: number } })?.payload;
              return row ? `${Number(value)}% (${row.completed}/${row.planned})` : `${Number(value)}%`;
            }}
          />
          <Bar dataKey="percent" name="Completed" radius={[0, 4, 4, 0]}>
            {data.map((row) => (
              <Cell
                key={row.name}
                fill={
                  row.percent >= 95
                    ? 'var(--success)'
                    : row.percent >= 80
                      ? 'var(--primary)'
                      : row.percent >= 60
                        ? 'var(--warning)'
                        : 'var(--destructive)'
                }
              />
            ))}
            {/* The number on the bar, so the band is never only a colour. */}
            <LabelList
              dataKey="percent"
              position="right"
              formatter={percentFormatter}
              fontSize={11}
              fill="var(--muted-foreground)"
            />
          </Bar>
        </BarChart>
      </ChartFrame>
      <Summary>
        {data.map((row) => (
          <SummaryRow
            key={row.name}
            label={row.name}
            value={`${row.completed} of ${row.planned} · ${Math.round(row.percent)}% · ${band(row.percent)}`}
          />
        ))}
      </Summary>
    </figure>
  );
}

export function SupplementAdherenceChart({
  data,
}: {
  data: Array<{ name: string; percent: number; completed: number; planned: number }>;
}) {
  return <CompletionByMealChart data={data} />;
}

export function YieldChart({
  data,
}: {
  data: Array<{ foodName: string; averagePct: number; currentPct: number | null }>;
}) {
  return (
    <ChartFrame height={Math.max(140, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 8, bottom: 4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} unit="%" />
        <YAxis
          type="category"
          dataKey="foodName"
          tick={AXIS}
          tickLine={false}
          axisLine={false}
          width={88}
        />
        <Tooltip {...tooltipStyle} formatter={percentFormatter} />
        {/*
          One series and one colour, so nothing here depends on telling hues
          apart. The figures are listed by the page that owns this chart.
        */}
        <Bar dataKey="averagePct" name="Measured average" fill="var(--primary)" radius={[0, 4, 4, 0]}>
          <LabelList
            dataKey="averagePct"
            position="right"
            formatter={percentFormatter}
            fontSize={11}
            fill="var(--muted-foreground)"
          />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}
