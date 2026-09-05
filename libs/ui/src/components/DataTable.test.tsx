import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from './DataTable';

import type { ColumnDef } from '@tanstack/react-table';

interface Expense {
  id: string;
  merchant: string;
  accountId: string;
}

const rows: Expense[] = [
  { id: '1', merchant: 'Woolworths', accountId: 'a1' },
  { id: '2', merchant: 'Bunnings', accountId: 'a2' },
  { id: '3', merchant: 'Woolworths Metro', accountId: 'a1' },
];

const columns: ColumnDef<Expense>[] = [
  { accessorKey: 'merchant', header: 'Merchant' },
  { accessorKey: 'accountId', header: 'Account' },
];

describe('DataTable — initialColumnFilters', () => {
  it('renders every row when no initial filter is given', () => {
    render(<DataTable columns={columns} data={rows} />);
    expect(screen.getByText('Woolworths')).toBeInTheDocument();
    expect(screen.getByText('Bunnings')).toBeInTheDocument();
    expect(screen.getByText('Woolworths Metro')).toBeInTheDocument();
  });

  it('opens pre-filtered to the given column value', () => {
    render(
      <DataTable
        columns={columns}
        data={rows}
        initialColumnFilters={[{ id: 'accountId', value: 'a2' }]}
      />
    );
    expect(screen.queryByText('Woolworths')).not.toBeInTheDocument();
    expect(screen.queryByText('Woolworths Metro')).not.toBeInTheDocument();
    expect(screen.getByText('Bunnings')).toBeInTheDocument();
  });
});
