/** The selectable, sortable, resizable, cursor-paged inventory table. */
import { useEffect, useRef } from 'react';

import { ColumnWidthsProvider, useColumnWidths } from './column-resize';
import { ListBody } from './list-body';
import { TableHeader } from './table-header';
import { TableRow } from './table-row';

import type { ReactElement, RefObject } from 'react';

import type { ItemsSort } from '../../inventory-web/items-url-filters';
import type { ItemRowModel } from '../model/model';
import type { PlacementWorld } from '../model/placement-model';
import type { SelectionApi } from '../selection/use-selection';
import type { RowVerbId, SecondColumn, TableDensity } from './table-row';

export type { ItemsSort } from '../../inventory-web/items-url-filters';
export type { RowVerbId, SecondColumn } from './table-row';

/** The data, selection state, and behaviours required to render the table. */
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
  secondColumn?: SecondColumn;
  onOpen?: (id: string) => void;
  onRowVerb?: (verb: RowVerbId, item: ItemRowModel) => void;
  onLoadMore?: () => void;
  label: string;
}

function Footer({
  shown,
  total,
  footerRef,
}: {
  shown: number;
  total: number;
  footerRef: RefObject<HTMLParagraphElement | null>;
}): ReactElement | null {
  if (shown >= total) return null;
  return (
    <p ref={footerRef} className="border-t px-4 py-2.5 text-xs text-muted-foreground">
      {`${shown.toLocaleString('en-AU')} of ${total.toLocaleString('en-AU')} loaded. The next page loads as you scroll.`}
    </p>
  );
}

function useLoadMoreObserver(
  footerRef: RefObject<HTMLParagraphElement | null>,
  rowsLength: number,
  total: number,
  onLoadMore: (() => void) | undefined
): void {
  const loadedCount = useRef<number | null>(null);

  useEffect(() => {
    if (onLoadMore === undefined || rowsLength >= total) return;
    const footer = footerRef.current;
    if (footer === null) return;
    const listBody = footer.closest<HTMLElement>('[data-list-body]');
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        if (loadedCount.current === rowsLength) return;
        loadedCount.current = rowsLength;
        onLoadMore();
      },
      { root: listBody, threshold: 0.1 }
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, [footerRef, onLoadMore, rowsLength, total]);
}

/** Renders a table whose loaded rows scroll inside a sticky-header list body. */
export function ItemsTable(props: ItemsTableProps): ReactElement {
  const { rows, world, selection } = props;
  const tableRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLParagraphElement>(null);
  const api = useColumnWidths(tableRef);
  useLoadMoreObserver(footerRef, rows.length, props.total, props.onLoadMore);

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
          <TableHeader
            selection={selection}
            sort={props.sort}
            onSort={props.onSort}
            secondColumn={props.secondColumn}
            api={api}
          />
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
                onRowVerb={props.onRowVerb}
              />
            ))}
          </div>
          <Footer shown={rows.length} total={props.total} footerRef={footerRef} />
        </div>
      </ColumnWidthsProvider>
    </ListBody>
  );
}
