/** The sticky header and sortable cells for the item table. */
import { ArrowDown } from 'lucide-react';

import { ButtonPrimitive, Checkbox, cn } from '@pops/ui';

import { ColumnResizeHandle, useColumnClass } from './column-resize';

import type { ReactElement, ReactNode } from 'react';

import type { ItemsSort } from '../../inventory-web/items-url-filters';
import type { SelectionApi } from '../selection/use-selection';
import type { ColumnWidthsApi } from './column-resize';
import type { ColumnId } from './column-widths';
import type { SecondColumn } from './table-row';

/** The selection, sorting, and widths needed by the table header. */
export interface TableHeaderProps {
  selection: SelectionApi;
  sort?: ItemsSort;
  onSort?: (sort: ItemsSort) => void;
  secondColumn?: SecondColumn;
  api: ColumnWidthsApi;
}

function SortHeader(props: {
  label: string;
  sort: ItemsSort;
  active: boolean;
  onSort?: (sort: ItemsSort) => void;
  className?: string;
}): ReactElement {
  return (
    <span className={props.className}>
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        aria-pressed={props.active}
        className={cn('-ml-2 px-2 uppercase tracking-label', props.active && 'text-foreground')}
        onClick={() => props.onSort?.(props.sort)}
      >
        {props.label}
        {props.active ? <ArrowDown className="size-3" aria-hidden /> : null}
      </ButtonPrimitive>
    </span>
  );
}

function HeaderCell(props: {
  id: ColumnId;
  label: string;
  api: ColumnWidthsApi;
  className?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <span
      data-col={props.id}
      className={cn(useColumnClass(props.id), 'relative flex items-center', props.className)}
    >
      {props.children}
      <ColumnResizeHandle id={props.id} label={props.label} api={props.api} />
    </span>
  );
}

interface HeaderColumn {
  id: ColumnId;
  label: string;
  sort?: ItemsSort;
  className?: string;
  sortClassName?: string;
}

function headerColumns(secondColumn: SecondColumn | undefined): readonly HeaderColumn[] {
  return [
    { id: 'name', label: 'Name', sort: 'name', className: 'pl-9' },
    {
      id: 'type',
      label: secondColumn?.header ?? 'Type',
      sort: secondColumn === undefined ? 'type' : undefined,
      className: secondColumn === undefined ? undefined : 'uppercase tracking-label',
    },
    { id: 'where', label: 'Where', sort: 'where' },
    { id: 'code', label: 'Code', className: 'uppercase tracking-label' },
    { id: 'updated', label: 'Updated', sort: 'updated', sortClassName: 'hidden lg:block' },
  ];
}

/** Renders the sticky sortable header for an item table. */
export function TableHeader(props: TableHeaderProps): ReactElement {
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
      {headerColumns(props.secondColumn).map((column) => (
        <HeaderCell
          key={column.id}
          id={column.id}
          label={column.label}
          api={api}
          className={column.className}
        >
          {column.sort === undefined ? (
            column.label
          ) : (
            <SortHeader
              label={column.label}
              sort={column.sort}
              active={sort === column.sort}
              onSort={onSort}
              className={column.sortClassName}
            />
          )}
        </HeaderCell>
      ))}
    </div>
  );
}
