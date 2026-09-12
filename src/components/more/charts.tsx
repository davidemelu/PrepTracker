'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
 */

const AXIS = { fontSize: 11, fill: 'var(--muted-foreground)' };
const GRID = 'var(--border)';

function ChartFrame({ height = 200, children }: { height?: number; children: React.ReactElement }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
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
    <ChartFrame>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={44} unit="%" />
        <Tooltip {...tooltipStyle} formatter={percentFormatter} />
        <ReferenceLine y={100} stroke={GRID} strokeDasharray="2 2" />
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
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="water"
          name="Water"
          stroke="var(--rest)"
          strokeWidth={1.5}
          dot={false}
        />
      </LineChart>
    </ChartFrame>
  );
}

export function WaterTrendChart({
  data,
}: {
  data: Array<{ date: string; totalMl: number; targetMl: number }>;
}) {
  const target = data.at(-1)?.targetMl ?? 0;
  return (
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
  );
}

export function CompletionByMealChart({
  data,
}: {
  data: Array<{ name: string; percent: number; completed: number; planned: number }>;
}) {
  return (
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
        </Bar>
      </BarChart>
    </ChartFrame>
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
        <Bar dataKey="averagePct" name="Measured average" fill="var(--primary)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartFrame>
  );
}
