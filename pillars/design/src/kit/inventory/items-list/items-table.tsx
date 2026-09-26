/**
 * The item table: a sticky header over rows that scroll, driven by the
 * shared selection model so j/k, x, Shift-x, Cmd-A and Esc behave as in
 * every other inventory list. Only a window of rows is mounted; the footer
 * says how many more the cursor-paged list will load on scroll.
 */
import { ArrowDown } from 'lucide-react';
import { useRef } from 'react';

import { ButtonPrimitive, Checkbox, cn } from '@pops/ui';

import {
  ColumnResizeHandle,
  ColumnWidthsProvider,
  useColumnClass,
  useColumnWidths,
} from './column-resize';
import { ListBody } from './list-page';
import { TableRow } from './table-row';

import type { ReactNode } from 'react';

import type { ItemRowModel, PlacementWorld, SelectionApi } from '../foundation';
import type { ItemsSort } from './browse-model';
import type { ColumnWidthsApi } from './column-resize';
import type { ColumnId } from './column-widths';
import type { SecondColumn, TableDensity } from './table-row';

/** Props for {@link ItemsTable}. */
export interface ItemsTableProps {
  rows: readonly ItemRowModel[];
  total: number;
  world: PlacementWorld;
  selection: SelectionApi;
  density?: TableDensity;
  sort?: ItemsSort;
  onSort?: (sort: ItemsSort) => void;
  pendingIds?: ReadonlySet<string>;
  rejections?: Readonly<Record<string, string>>;
  /** Replaces the Type column: Containers shows what each box holds. */
  secondColumn?: SecondColumn;
  onOpen?: (id: string) => void;
  label: string;
}

function SortHeader({
  label,
  sort,
  active,
  onSort,
  className,
}: {
  label: string;
  sort: ItemsSort;
  active: boolean;
  onSort?: (sort: ItemsSort) => void;
  className?: string;
}) {
  return (
    <span className={className}>
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        aria-pressed={active}
        className={cn('-ml-2 px-2 uppercase tracking-label', active && 'text-foreground')}
        onClick={() => onSort?.(sort)}
      >
        {label}
        {active ? <ArrowDown className="size-3" aria-hidden /> : null}
      </ButtonPrimitive>
    </span>
  );
}

function HeaderCell({
  id,
  label,
  api,
  className,
  children,
}: {
  id: ColumnId;
  label: string;
  api: ColumnWidthsApi;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span data-col={id} className={cn(useColumnClass(id), 'relative flex items-center', className)}>
      {children}
      <ColumnResizeHandle id={id} label={label} api={api} />
    </span>
  );
}

function Header(props: ItemsTableProps & { api: ColumnWidthsApi }) {
  const { selection, sort = 'name', onSort, api } = props;
  return (
    <div
      role="row"
      className="sticky top-0 z-10 flex h-9 items-center gap-3 border-b bg-card pr-2 pl-3.5 text-2xs font-semibold text-muted-foreground"
    >
      <Checkbox
        aria-label="Select all loaded rows"
        checked={selection.coverage === 'some' ? 'indeterminate' : selection.coverage === 'all'}
        onClick={(event) => {
          event.preventDefault();
          selection.onHeaderToggle();
        }}
      />
      <HeaderCell id="name" label="Name" api={api} className="pl-9">
        <SortHeader label="Name" sort="name" active={sort === 'name'} onSort={onSort} />
      </HeaderCell>
      {props.secondColumn ? (
        <HeaderCell
          id="type"
          label={props.secondColumn.header}
          api={api}
          className="uppercase tracking-label"
        >
          {props.secondColumn.header}
        </HeaderCell>
      ) : (
        <HeaderCell id="type" label="Type" api={api}>
          <SortHeader label="Type" sort="type" active={sort === 'type'} onSort={onSort} />
        </HeaderCell>
      )}
      <HeaderCell id="where" label="Where" api={api}>
        <SortHeader label="Where" sort="where" active={sort === 'where'} onSort={onSort} />
      </HeaderCell>
      <HeaderCell id="code" label="Code" api={api} className="uppercase tracking-label">
        Code
      </HeaderCell>
      <HeaderCell id="updated" label="Updated" api={api}>
        <SortHeader
          label="Updated"
          sort="updated"
          active={sort === 'updated'}
          onSort={onSort}
          className="hidden lg:block"
        />
      </HeaderCell>
    </div>
  );
}

function Footer({ shown, total }: { shown: number; total: number }) {
  if (shown >= total) return null;
  return (
    <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
      {`${shown.toLocaleString('en-AU')} of ${total.toLocaleString('en-AU')} loaded. The next page loads as you scroll.`}
    </p>
  );
}

/** The item table. Column edges in the header drag to resize; double-click fits. */
export function ItemsTable(props: ItemsTableProps) {
  const { rows, world, selection } = props;
  const tableRef = useRef<HTMLDivElement>(null);
  const api = useColumnWidths(tableRef);
  return (
    <ListBody>
      <ColumnWidthsProvider widths={api.widths}>
        <div
          ref={tableRef}
          role="grid"
          aria-label={props.label}
          aria-multiselectable
          tabIndex={0}
          style={api.style}
          className="outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          onKeyDown={(event) => {
            if (selection.onKey(event)) event.preventDefault();
          }}
        >
          <Header {...props} api={api} />
          <div className="divide-y divide-border/60">
            {rows.map((item) => (
              <TableRow
                key={item.id}
                item={item}
                world={world}
                density={props.density ?? 'default'}
                selected={selection.isSelected(item.id)}
                focused={selection.state.focusedId === item.id}
                pending={props.pendingIds?.has(item.id)}
                rejection={props.rejections?.[item.id] ?? null}
                SecondCell={props.secondColumn?.Cell}
                onToggle={selection.onRowToggle}
                onOpen={props.onOpen}
              />
            ))}
          </div>
          <Footer shown={rows.length} total={props.total} />
        </div>
      </ColumnWidthsProvider>
    </ListBody>
  );
}
