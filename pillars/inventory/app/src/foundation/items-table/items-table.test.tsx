import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSelection } from '../selection/use-selection';
import { coreItem, coreWorld } from '../test-fixtures/core';
import { ItemsTable } from './items-table';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../model/model';
import type { SelectionApi, SelectionKey } from '../selection/use-selection';
import type { ItemsTableProps, RowVerbId, SecondColumn } from './items-table';

const ROWS: readonly ItemRowModel[] = [
  coreItem('itm-tv'),
  coreItem('box-k13'),
  coreItem('itm-tape'),
  coreItem('itm-drill'),
];

const originalIntersectionObserver = globalThis.IntersectionObserver;
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const originalSetPointerCapture = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'setPointerCapture'
);

const observers: TestIntersectionObserver[] = [];

class TestIntersectionObserver implements IntersectionObserver {
  readonly root: Element | null;
  readonly rootMargin = '';
  readonly scrollMargin = '';
  readonly thresholds: readonly number[] = [];
  private readonly callback: IntersectionObserverCallback;
  private target: Element | null = null;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.root = options?.root instanceof Element ? options.root : null;
    observers.push(this);
  }

  observe(target: Element): void {
    this.target = target;
  }

  unobserve(target: Element): void {
    if (this.target === target) this.target = null;
  }

  disconnect(): void {
    this.target = null;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(isIntersecting = true): void {
    if (this.target === null) return;
    const bounds = this.target.getBoundingClientRect();
    const entry: IntersectionObserverEntry = {
      boundingClientRect: bounds,
      intersectionRatio: isIntersecting ? 1 : 0,
      intersectionRect: bounds,
      isIntersecting,
      rootBounds: null,
      target: this.target,
      time: 0,
    };
    this.callback([entry], this);
  }
}

function makeSelection(
  rows: readonly ItemRowModel[],
  selectedIds: readonly string[] = [],
  focusedId: string | null = null
): SelectionApi {
  const selected = new Set(selectedIds);
  let coverage: SelectionApi['coverage'];
  if (selected.size === 0) coverage = 'none';
  else if (selected.size === rows.length) coverage = 'all';
  else coverage = 'some';
  return {
    state: { selected, anchorId: null, focusedId },
    count: selected.size,
    coverage,
    selectedIds: rows.filter((row) => selected.has(row.id)).map((row) => row.id),
    isSelected: (id) => selected.has(id),
    onRowToggle: vi.fn(),
    onHeaderToggle: vi.fn(),
    clearSelection: vi.fn(),
    onKey: vi.fn<(event: SelectionKey) => boolean>(() => false),
  };
}

function renderTable(overrides: Partial<ItemsTableProps> = {}) {
  const rows = overrides.rows ?? ROWS;
  const tableProps: ItemsTableProps = {
    rows,
    total: overrides.total ?? rows.length,
    world: coreWorld,
    selection: makeSelection(rows),
    label: 'Inventory items',
    ...overrides,
  };
  return render(<ItemsTable {...tableProps} />);
}

function SelectionTable(): ReactElement {
  const selection = useSelection(ROWS.map((row) => row.id));
  return (
    <ItemsTable
      rows={ROWS}
      total={ROWS.length}
      world={coreWorld}
      selection={selection}
      label="Inventory items"
    />
  );
}

beforeEach(() => {
  observers.length = 0;
  globalThis.IntersectionObserver = TestIntersectionObserver;
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get: () => 200,
  });
  Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  if (originalIntersectionObserver === undefined) {
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  } else {
    globalThis.IntersectionObserver = originalIntersectionObserver;
  }
  if (originalOffsetWidth === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, 'offsetWidth');
  } else {
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth);
  }
  if (originalSetPointerCapture === undefined) {
    Reflect.deleteProperty(HTMLElement.prototype, 'setPointerCapture');
  } else {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', originalSetPointerCapture);
  }
});

describe('ItemsTable column resizing', () => {
  it('dragging a header grip sets the column width as a custom property on the grid', () => {
    renderTable();
    const grip = screen.getByRole('separator', { name: /Resize Name/ });
    const grid = screen.getByRole('grid');

    fireEvent.pointerDown(grip, { button: 0, clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(grip, { clientX: 140, pointerId: 1 });

    expect(grid).toHaveStyle('--col-name: 240px');
  });

  it('ArrowRight on a grip widens the column by 16px and stops at the max', () => {
    renderTable();
    const grip = screen.getByRole('separator', { name: /Resize Type/ });
    const grid = screen.getByRole('grid');

    fireEvent.keyDown(grip, { key: 'ArrowRight' });
    expect(grid).toHaveStyle('--col-type: 216px');
    for (let press = 0; press < 20; press += 1) {
      fireEvent.keyDown(grip, { key: 'ArrowRight' });
    }
    expect(grid).toHaveStyle('--col-type: 320px');
  });

  it('Enter on a grip with nothing measurable returns the column to its minimum', () => {
    renderTable();
    const grip = screen.getByRole('separator', { name: /Resize Type/ });
    const grid = screen.getByRole('grid');

    fireEvent.keyDown(grip, { key: 'Enter' });

    expect(grid).toHaveStyle('--col-type: 72px');
  });
});

describe('ItemsTable selection and headers', () => {
  it('j and x on the focused grid move focus and tick the row', () => {
    render(<SelectionTable />);
    const grid = screen.getByRole('grid');

    fireEvent.keyDown(grid, { key: 'j' });
    const televisionRow = screen
      .getByRole('button', { name: 'Open Television' })
      .closest('[role="row"]');
    if (televisionRow === null) throw new Error('Television row was not rendered');
    expect(televisionRow).toHaveAttribute('data-focused', 'true');

    fireEvent.keyDown(grid, { key: 'x' });

    expect(televisionRow).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('checkbox', { name: 'Select Television' })).toHaveAttribute(
      'data-state',
      'checked'
    );
  });

  it('the active sort header is aria-pressed and another header calls onSort', () => {
    const onSort = vi.fn<NonNullable<ItemsTableProps['onSort']>>();
    renderTable({ sort: 'updated', onSort });

    expect(screen.getByRole('button', { name: /Updated/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Type/ }));

    expect(onSort).toHaveBeenCalledWith('type');
  });

  it('secondColumn replaces the Type header and cell', () => {
    function HoldsCell({ item }: { item: ItemRowModel }): ReactElement {
      return <span>Holds {item.name}</span>;
    }
    const secondColumn: SecondColumn = { header: 'Holds', Cell: HoldsCell };

    renderTable({ rows: [coreItem('box-k13')], secondColumn });

    expect(screen.getByText('Holds')).toBeInTheDocument();
    expect(screen.getByText('Holds Kitchen 13')).toBeInTheDocument();
    expect(screen.queryByText('Type')).not.toBeInTheDocument();
  });
});

describe('ItemsTable paging and row state', () => {
  it('the footer counts loaded rows and calls onLoadMore once when it comes into view', () => {
    const onLoadMore = vi.fn();
    const { rerender } = renderTable({ rows: ROWS.slice(0, 2), total: 4, onLoadMore });

    expect(
      screen.getByText('2 of 4 loaded. The next page loads as you scroll.')
    ).toBeInTheDocument();
    const observer = observers[0];
    if (observer === undefined) throw new Error('The footer observer was not created');
    observer.trigger();
    observer.trigger();
    expect(onLoadMore).toHaveBeenCalledOnce();

    const nextRows = ROWS.slice(0, 3);
    rerender(
      <ItemsTable
        rows={nextRows}
        total={4}
        world={coreWorld}
        selection={makeSelection(nextRows)}
        onLoadMore={onLoadMore}
        label="Inventory items"
      />
    );
    const nextObserver = observers.at(-1);
    if (nextObserver === undefined) throw new Error('The next footer observer was not created');
    nextObserver.trigger();
    expect(onLoadMore).toHaveBeenCalledTimes(2);
  });

  it('shows no footer and never calls onLoadMore when every row is loaded', () => {
    const onLoadMore = vi.fn();
    renderTable({ onLoadMore });

    expect(screen.queryByText(/The next page loads as you scroll/)).not.toBeInTheDocument();
    expect(onLoadMore).not.toHaveBeenCalled();
    expect(observers).toHaveLength(0);
  });

  it('a pending row has the accent edge and a rejected row shows its reason', () => {
    renderTable({
      rows: [coreItem('itm-tape'), coreItem('itm-drill')],
      pendingIds: new Set(['itm-tape']),
      rejections: { 'itm-drill': 'Office 04 is closed.' },
    });

    const pendingRow = screen
      .getByRole('button', { name: 'Open Tape measure' })
      .closest('[role="row"]');
    if (pendingRow === null) throw new Error('Tape measure row was not rendered');
    expect(pendingRow).toHaveClass('border-l-app-accent');
    expect(screen.getByRole('alert')).toHaveTextContent('Not saved. Office 04 is closed.');
  });

  it('row verbs offer Put back for an item in hand and report the verb and item', () => {
    const onRowVerb = vi.fn<(verb: RowVerbId, item: ItemRowModel) => void>();
    const tape = coreItem('itm-tape');
    renderTable({ rows: [tape], onRowVerb });

    fireEvent.click(screen.getByRole('button', { name: 'Put back' }));

    expect(onRowVerb).toHaveBeenCalledWith('put-back', tape);
  });
});
