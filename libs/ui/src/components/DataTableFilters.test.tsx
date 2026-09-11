import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { type ColumnFilter, FilterBar, numberRangeFilter } from './DataTableFilters';

interface Expense {
  id: string;
  merchant: string;
  category: string;
  amount: number;
}

const rows: Expense[] = [
  { id: '1', merchant: 'Woolworths', category: 'groceries', amount: 20 },
  { id: '2', merchant: 'Bunnings', category: 'hardware', amount: 50 },
  { id: '3', merchant: 'Woolworths Metro', category: 'groceries', amount: 80 },
];

const columns: ColumnDef<Expense>[] = [
  { accessorKey: 'merchant', header: 'Merchant' },
  { accessorKey: 'category', header: 'Category' },
  { accessorKey: 'amount', header: 'Amount', filterFn: numberRangeFilter },
];

const amountRangeFilters: ColumnFilter[] = [{ id: 'amount', type: 'numberrange', label: 'Amount' }];

const defaultFilters: ColumnFilter[] = [
  { id: 'merchant', type: 'text', label: 'Merchant', placeholder: 'Search merchant' },
  {
    id: 'category',
    type: 'select',
    label: 'Category',
    options: [
      { value: 'groceries', label: 'Groceries' },
      { value: 'hardware', label: 'Hardware' },
    ],
  },
];

/**
 * `FilterBar` is generic over the row type — this harness hands it a
 * `Table<Expense>` with no cast, which is the property under test.
 */
function Harness({ filters = defaultFilters }: { filters?: ColumnFilter[] }) {
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  // oxlint-disable-next-line react/incompatible-library -- see DataTable.hook.ts, POPS-3356.
  const table = useReactTable({
    data: rows,
    columns,
    state: { columnFilters },
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });
  const matched: Expense[] = table.getFilteredRowModel().rows.map((row) => row.original);
  return (
    <div>
      <FilterBar filters={filters} table={table} />
      <output data-testid="matches">{matched.map((row) => row.merchant).join(',')}</output>
    </div>
  );
}

function matches(): string {
  return screen.getByTestId('matches').textContent ?? '';
}

/** The desktop grid and the mobile dialog each render one control per filter. */
function control(label: string): HTMLElement {
  const [first] = screen.getAllByLabelText(label);
  if (!first) throw new Error(`no control labelled ${label}`);
  return first;
}

describe('FilterBar', () => {
  it('drives the typed table through a text filter', () => {
    render(<Harness />);
    expect(matches()).toBe('Woolworths,Bunnings,Woolworths Metro');

    fireEvent.change(control('Merchant'), { target: { value: 'Woolworths' } });
    expect(matches()).toBe('Woolworths,Woolworths Metro');
  });

  it('drives the typed table through a select filter', () => {
    render(<Harness />);
    fireEvent.change(control('Category'), { target: { value: 'hardware' } });
    expect(matches()).toBe('Bunnings');
  });

  it('keeps both date fields in a vertical range control', () => {
    render(<Harness filters={[{ id: 'merchant', type: 'daterange', label: 'Date range' }]} />);

    const from = control('Date range (from)');
    const to = control('Date range (to)');
    const range = from.closest('div.flex.flex-col');

    expect(range).not.toBeNull();
    expect(range).toHaveClass('flex-col');
    expect(range).not.toHaveClass('sm:flex-row');
    expect(to).toBeInTheDocument();
  });

  it('counts only filters that hold a value, and clears them all', () => {
    render(<Harness />);
    expect(screen.queryByText(/filters? active/)).not.toBeInTheDocument();

    fireEvent.change(control('Merchant'), { target: { value: 'Bunnings' } });
    expect(screen.getByText('1 filter active')).toBeInTheDocument();

    fireEvent.change(control('Category'), { target: { value: 'hardware' } });
    expect(screen.getByText('2 filters active')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /clear all/i })[0]!);
    expect(matches()).toBe('Woolworths,Bunnings,Woolworths Metro');
    expect(screen.queryByText(/filters? active/)).not.toBeInTheDocument();
  });

  it('skips a filter whose column does not exist on the table', () => {
    render(<Harness filters={[{ id: 'missing', type: 'text', label: 'Not A Column' }]} />);
    expect(screen.queryByLabelText('Not A Column')).not.toBeInTheDocument();
  });

  describe('number range filter', () => {
    it('narrows rows to those at or above a typed min', () => {
      render(<Harness filters={amountRangeFilters} />);
      fireEvent.change(control('Amount (min)'), { target: { value: '50' } });
      expect(matches()).toBe('Bunnings,Woolworths Metro');
    });

    it('narrows rows to those at or below a typed max', () => {
      render(<Harness filters={amountRangeFilters} />);
      fireEvent.change(control('Amount (max)'), { target: { value: '50' } });
      expect(matches()).toBe('Woolworths,Bunnings');
    });

    it('narrows rows to those within both a typed min and max', () => {
      render(<Harness filters={amountRangeFilters} />);
      fireEvent.change(control('Amount (min)'), { target: { value: '25' } });
      fireEvent.change(control('Amount (max)'), { target: { value: '60' } });
      expect(matches()).toBe('Bunnings');
    });

    it('restores the rows a bound filtered out once that bound is cleared', () => {
      render(<Harness filters={amountRangeFilters} />);
      const min = control('Amount (min)');
      fireEvent.change(min, { target: { value: '50' } });
      expect(matches()).toBe('Bunnings,Woolworths Metro');

      fireEvent.change(min, { target: { value: '' } });
      expect(matches()).toBe('Woolworths,Bunnings,Woolworths Metro');
    });

    it('ignores a non-numeric entry instead of filtering everything out', () => {
      render(<Harness filters={amountRangeFilters} />);
      fireEvent.change(control('Amount (min)'), { target: { value: 'abc' } });
      expect(matches()).toBe('Woolworths,Bunnings,Woolworths Metro');
      expect(screen.queryByText(/filters? active/)).not.toBeInTheDocument();
    });

    it('does not warn about NaN while driving the control', () => {
      const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<Harness filters={amountRangeFilters} />);
      fireEvent.change(control('Amount (min)'), { target: { value: '50' } });
      expect(warn.mock.calls.flat().join(' ')).not.toMatch(/NaN/);
      warn.mockRestore();
    });
  });
});
