import { Box, Package } from 'lucide-react';

import { ButtonPrimitive, Tabs, TabsList, TabsTrigger, cn } from '@pops/ui';

import { formatReportDollars } from './reports-model.js';
import { ShareBar } from './reports-parts.js';

import type { ReactElement } from 'react';

import type { WebReportsValuesResponse } from '../../inventory-api/types.gen.js';
import type { ValueReportBasis } from '../../inventory-web/useValueReport.js';

type ValueGroup = WebReportsValuesResponse['groups'][number];
type ValueEntry = ValueGroup['entries'][number];

/** Renders one validated choice set used by the Values toolbar. */
export function ValuesSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly onChange: (value: T) => void;
}): ReactElement {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option !== undefined) onChange(option.value);
      }}
    >
      <TabsList aria-label={label}>
        {options.map((option) => (
          <TabsTrigger key={option.value} value={option.value} className="flex-none px-3">
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Renders one server-grouped Values row and its server-provided share. */
export function ValueGroupRow({
  group,
  active,
  onSelect,
}: {
  readonly group: ValueGroup;
  readonly active: boolean;
  readonly onSelect: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onSelect}
      className="flex min-h-11 min-w-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-none border-l-2 border-transparent px-4 py-2 text-left transition-colors hover:bg-muted/60 aria-pressed:border-l-app-accent aria-pressed:bg-app-accent/10"
    >
      <span className="min-w-0 flex-1 truncate text-sm">{group.label}</span>
      <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
        {Math.round(group.share * 100)}%
      </span>
      <span className="w-20 text-right text-sm tabular-nums">
        {formatReportDollars(group.value)}
      </span>
      <ShareBar share={group.share} className="block w-full" />
    </button>
  );
}

/** Renders one server-provided Values entry without recalculating its total. */
export function ValueEntryRow({
  entry,
  basis,
  onOpen,
}: {
  readonly entry: ValueEntry;
  readonly basis: ValueReportBasis;
  readonly onOpen?: (id: string) => void;
}): ReactElement {
  const Icon = entry.isContainer ? Box : Package;
  const open = onOpen === undefined ? undefined : () => onOpen(entry.itemId);
  return (
    <li className="flex min-h-11 items-center gap-3 px-4">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      {open === undefined ? (
        <span className="min-w-0 truncate text-sm font-medium">{entry.name}</span>
      ) : (
        <ButtonPrimitive
          variant="ghost"
          size="sm"
          className="h-8 min-w-0 shrink justify-start px-0 text-sm font-medium hover:bg-transparent hover:underline"
          aria-label={`Open ${entry.name}`}
          onClick={open}
        >
          <span className="truncate">{entry.name}</span>
        </ButtonPrimitive>
      )}
      {entry.code === null ? null : (
        <span className="shrink-0 text-xs text-muted-foreground">{entry.code}</span>
      )}
      <span className="ml-auto shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {entry.quantity > 1 && entry.unitValue !== null
          ? `${entry.quantity} × ${formatReportDollars(entry.unitValue)}`
          : null}
      </span>
      <span
        className={cn(
          'w-20 shrink-0 text-right text-sm tabular-nums',
          entry.value === null && 'text-muted-foreground'
        )}
      >
        {entry.value === null ? 'No value' : formatReportDollars(entry.value)}
      </span>
      <span className="sr-only">
        {basis === 'replacement' ? 'Replacement value' : 'Price paid'}
      </span>
    </li>
  );
}
