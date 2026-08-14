import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { type ColumnFilter, FilterBar } from './DataTableFilters';

interface Expense {
  id: string;
  merchant: string;
  category: string;
}

const rows: Expense[] = [
  { id: '1', merchant: 'Woolworths', category: 'groceries' },
  { id: '2', merchant: 'Bunnings', category: 'hardware' },
  { id: '3', merchant: 'Woolworths Metro', category: 'groceries' },
];

const columns: ColumnDef<Expense>[] = [
  { accessorKey: 'merchant', header: 'Merchant' },
  { accessorKey: 'category', header: 'Category' },
];

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
});
