import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import {
  Badge,
  Button,
  type ColumnFilter,
  dateRangeFilter,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  SortableHeader,
} from '@pops/ui';

import { TagEditor } from '../../components/TagEditor';
import { labelForType, TRANSACTION_TYPES } from '../../lib/transaction-type';
import { AmountCell, DescriptionCell } from './cells';

import type { ColumnDef } from '@tanstack/react-table';
import type { TFunction } from 'i18next';

import type { Transaction } from './types';

export type { Transaction } from './types';

interface BuildColumnsArgs {
  t: TFunction<'finance'>;
  availableTags: string[];
  onTagSave: (
    id: string,
    entityId: string | null,
    description: string
  ) => (tags: string[]) => Promise<void>;
  onTagSuggest: (description: string, entityId: string | null) => () => Promise<string[]>;
  onEdit: (transaction: Transaction) => void;
  onDelete: (transaction: Transaction) => void;
}

function tagsFilterFn(
  row: { getValue: <T>(id: string) => T },
  columnId: string,
  filterValue: unknown
): boolean {
  const searchTerm = String(filterValue ?? '')
    .toLowerCase()
    .trim();
  if (!searchTerm) return true;
  const tags = row.getValue<string[]>(columnId);
  if (!tags || tags.length === 0) return false;
  return tags.some((tag) => tag.toLowerCase().includes(searchTerm));
}

function buildCoreColumns(t: TFunction<'finance'>): ColumnDef<Transaction>[] {
  const typeLabels: Record<string, string> = {
    purchase: t('filter.expense'),
    income: t('filter.income'),
    transfer: t('filter.transfer'),
  };
  return [
    {
      accessorKey: 'date',
      header: ({ column }) => <SortableHeader column={column}>{t('column.date')}</SortableHeader>,
      cell: ({ row }) =>
        new Date(row.original.date).toLocaleDateString('en-AU', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
      filterFn: dateRangeFilter,
    },
    {
      accessorKey: 'description',
      header: t('column.description'),
      cell: ({ row }) => (
        <DescriptionCell
          description={row.original.description}
          entityName={row.original.entityName}
        />
      ),
    },
    {
      accessorKey: 'account',
      header: t('column.account'),
      cell: ({ row }) => <span className="text-sm font-mono">{row.original.account}</span>,
    },
    {
      accessorKey: 'amount',
      header: ({ column }) => (
        <div className="flex justify-end">
          <SortableHeader column={column}>{t('column.amount')}</SortableHeader>
        </div>
      ),
      cell: ({ row }) => <AmountCell amount={row.original.amount} />,
    },
    {
      accessorKey: 'type',
      header: t('column.type'),
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs">
          {typeLabels[row.original.type] ?? labelForType(row.original.type)}
        </Badge>
      ),
    },
  ];
}

function buildInteractiveColumns(args: BuildColumnsArgs): ColumnDef<Transaction>[] {
  const { t } = args;
  return [
    {
      accessorKey: 'tags',
      header: t('column.tags'),
      cell: ({ row }) => {
        const { id, tags, entityId, description } = row.original;
        return (
          <TagEditor
            currentTags={tags}
            onSave={args.onTagSave(id, entityId, description)}
            onSuggest={args.onTagSuggest(description, entityId)}
            availableTags={args.availableTags}
          />
        );
      },
      filterFn: tagsFilterFn,
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <div className="text-right">
          <DropdownMenu
            trigger={
              <Button variant="ghost" size="icon" aria-label="Actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            }
            align="end"
          >
            <DropdownMenuItem onClick={() => args.onEdit(row.original)}>
              <Pencil /> Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => args.onDelete(row.original)}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenu>
        </div>
      ),
    },
  ];
}

export function buildColumns(args: BuildColumnsArgs): ColumnDef<Transaction>[] {
  return [...buildCoreColumns(args.t), ...buildInteractiveColumns(args)];
}

/** Distinct account names present in the loaded transactions, alphabetised for the filter dropdown. */
export function getDistinctAccounts(
  transactions: Pick<Transaction, 'account'>[] | undefined
): string[] {
  if (!transactions) return [];
  return Array.from(new Set(transactions.map((transaction) => transaction.account))).toSorted(
    (a, b) => a.localeCompare(b)
  );
}

export function buildTransactionFilters(
  t: TFunction<'finance'>,
  accounts: string[]
): ColumnFilter[] {
  return [
    { id: 'date', type: 'daterange', label: t('filter.dateRange') },
    {
      id: 'account',
      type: 'select',
      label: t('filter.account'),
      options: [
        { label: t('filter.allAccounts'), value: '' },
        ...accounts.map((account) => ({ label: account, value: account })),
      ],
    },
    {
      id: 'type',
      type: 'select',
      label: t('filter.type'),
      options: [
        { label: t('filter.allTypes'), value: '' },
        // The three types with existing i18n keys keep their translations; every
        // other taxonomy value is derived, so a new type appears automatically.
        { label: t('filter.income'), value: 'income' },
        { label: t('filter.expense'), value: 'purchase' },
        { label: t('filter.transfer'), value: 'transfer' },
        ...TRANSACTION_TYPES.filter(
          (v) => v !== 'income' && v !== 'purchase' && v !== 'transfer'
        ).map((value) => ({ label: labelForType(value), value })),
      ],
    },
    { id: 'tags', type: 'text', label: t('filter.tag'), placeholder: t('placeholder.filterByTag') },
  ];
}
