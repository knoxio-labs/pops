import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/**
 * Horizontal bar chart shared by the value-breakdown cards, plus the boundary
 * that turns recharts' untyped data rows back into `BreakdownEntry`.
 */
import { formatCurrency } from '../lib/utils';

const BAR_COLORS = [
  'var(--primary)',
  'color-mix(in oklch, var(--primary) 80%, transparent)',
  'color-mix(in oklch, var(--primary) 60%, transparent)',
  'color-mix(in oklch, var(--primary) 45%, transparent)',
  'color-mix(in oklch, var(--primary) 30%, transparent)',
];

export interface BreakdownEntry {
  name: string;
  totalValue: number;
  itemCount: number;
  key?: string | null;
}

interface BreakdownChartProps {
  data: BreakdownEntry[];
  onBarClick?: (entry: BreakdownEntry) => void;
}

/**
 * Format a value for display in the breakdown chart.
 * Returns '\u2014' when value is 0 (no replacement value set on any item).
 */
function formatBreakdownValue(value: number): string {
  return value > 0 ? formatCurrency(value) : '\u2014';
}

/**
 * Recharts types the original data row behind every tooltip item and bar
 * rectangle as `any`, so it arrives unverified. This is the one place that turns
 * it back into a `BreakdownEntry`.
 */
function isBreakdownEntry(value: unknown): value is BreakdownEntry {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'totalValue' in value &&
    typeof value.totalValue === 'number' &&
    'itemCount' in value &&
    typeof value.itemCount === 'number'
  );
}

export function BreakdownTooltipContent({
  payload,
}: {
  payload?: ReadonlyArray<{ payload?: unknown }>;
}) {
  const entry = payload?.[0]?.payload;
  if (!isBreakdownEntry(entry)) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{entry.name}</p>
      <p className="text-muted-foreground">
        {formatBreakdownValue(entry.totalValue)} ({entry.itemCount} items)
      </p>
    </div>
  );
}

export function BreakdownChart({ data, onBarClick }: BreakdownChartProps) {
  const hasAnyValue = data.some((entry) => entry.totalValue > 0);

  if (data.length === 0 || !hasAnyValue) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
        No items with replacement values
      </div>
    );
  }

  const chartHeight = Math.max(120, data.length * 40 + 20);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatCurrency(v)}
          tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={100}
          tick={{ fill: 'var(--foreground)', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={(props) => <BreakdownTooltipContent payload={props.payload} />} />
        <Bar
          dataKey="totalValue"
          radius={[0, 4, 4, 0]}
          cursor={onBarClick ? 'pointer' : undefined}
          onClick={(rectangle) => {
            const row: unknown = rectangle.payload;
            if (onBarClick && isBreakdownEntry(row)) {
              onBarClick(row);
            }
          }}
        >
          {data.map((_, idx) => (
            <Cell key={idx} fill={BAR_COLORS[idx % BAR_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
