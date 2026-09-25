import { CodeBadge, ItemMark } from '@/kit/inventory/foundation';

/**
 * The Values tab's rows: a segmented control, a group with its share of the
 * total, and an item line with its value (quantity times unit when grouped).
 */
import { ButtonPrimitive, Tabs, TabsList, TabsTrigger, cn } from '@pops/ui';

import { entryValue, formatDollars } from './report-model';
import { ShareBar } from './report-parts';

import type { BreakdownGroup, ReportEntry, ValueBasis } from './report-model';

/** A small segmented choice over string values. */
export function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <Tabs
      value={props.value}
      onValueChange={(next) => {
        const found = props.options.find((o) => o.value === next);
        if (found) props.onChange(found.value);
      }}
    >
      <TabsList aria-label={props.label}>
        {props.options.map((option) => (
          <TabsTrigger key={option.value} value={option.value} className="flex-none px-3">
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** One group of a breakdown, with its share bar. */
export function GroupRow({
  group,
  active,
  onSelect,
}: {
  group: BreakdownGroup;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <ButtonPrimitive
      variant="ghost"
      aria-pressed={active}
      onClick={onSelect}
      className={cn(
        'grid h-auto w-full grid-cols-[minmax(0,1fr)_3rem_5.5rem] items-center gap-x-3 gap-y-1 rounded-none border-l-2 border-transparent px-4 py-2 text-left font-normal',
        active && 'border-l-app-accent bg-app-accent/10 hover:bg-app-accent/15'
      )}
    >
      <span className="truncate text-sm">{group.label}</span>
      <span className="text-right text-xs tabular-nums text-muted-foreground">
        {Math.round(group.share * 100)}%
      </span>
      <span className="text-right text-sm tabular-nums">{formatDollars(group.value)}</span>
      <ShareBar share={group.share} className="col-span-3" />
    </ButtonPrimitive>
  );
}

/** One item of the chosen group, with its value on the basis shown. */
export function EntryRow({
  entry,
  basis,
  onOpen,
}: {
  entry: ReportEntry;
  basis: ValueBasis;
  onOpen?: (id: string) => void;
}) {
  const value = entryValue(entry, basis);
  const unit =
    basis === 'replacement' ? entry.provenance?.replacementValue : entry.provenance?.purchasePrice;
  return (
    <li className="flex h-11 items-center gap-3 px-4">
      <ItemMark item={entry.item} />
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        className="h-auto min-w-0 shrink justify-start px-0 text-sm font-medium hover:bg-transparent hover:underline"
        aria-label={`Open ${entry.item.name}`}
        onClick={() => onOpen?.(entry.item.id)}
      >
        <span className="truncate">{entry.item.name}</span>
      </ButtonPrimitive>
      <span className="shrink-0 whitespace-nowrap">
        <CodeBadge code={entry.item.code} />
      </span>
      <span className="ml-auto shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {entry.item.quantity > 1 && unit != null
          ? `${entry.item.quantity} × ${formatDollars(unit)}`
          : null}
      </span>
      <span
        className={cn(
          'w-20 shrink-0 text-right text-sm tabular-nums',
          value === null && 'text-muted-foreground'
        )}
      >
        {value === null ? 'No value' : formatDollars(value)}
      </span>
    </li>
  );
}
