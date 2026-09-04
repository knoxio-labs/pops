import { Link2 } from 'lucide-react';

import { AccountChip, Badge, type ColumnFilter, dateRangeFilter, SortableHeader } from '@pops/ui';

import { resolveAccountOption } from '../../components/accounts/resolveAccountOption';
import { TagEditor } from '../../components/TagEditor';
import { labelForType, TRANSACTION_TYPES, type TransactionType } from '../../lib/transaction-type';
import { AmountCell, DescriptionCell } from './cells';
import { buildPurchaseLinkColumn } from './purchase-link/column';
import { RowActions, type RowActionHandlers } from './RowActions';

import type { ColumnDef } from '@tanstack/react-table';
import type { TFunction } from 'i18next';

import type { AccountOption } from '@pops/ui';

import type { PurchaseLinkSummaries } from './purchase-link/usePurchaseLinkSummaries';
import type { Transaction } from './types';

export type { Transaction } from './types';

interface BuildColumnsBase {
  t: TFunction<'finance'>;
  availableTags: string[];
  accounts: AccountOption[];
  /**
   * The purchase column's answers, plus whether asking for them worked. The
   * pair travels together because an empty map means nothing without it.
   */
  purchaseLinks: PurchaseLinkSummaries;
  onTagSave: (
    id: string,
    entityId: string | null,
    description: string
  ) => (tags: string[]) => Promise<void>;
  onTagSuggest: (description: string, entityId: string | null) => () => Promise<string[]>;
}

interface BuildColumnsArgs extends BuildColumnsBase, RowActionHandlers {}

/**
 * Each taxonomy type → its i18n key. The one place the badge labels and the
 * type-filter options agree, so a new type can never render as raw English in
 * one but not the other (`purchase` is surfaced as "Expense"). Typed against
 * `TransactionType` so adding a type without a key fails the build.
 */
const TYPE_LABEL_KEY: Record<TransactionType, string> = {
  purchase: 'filter.expense',
  transfer: 'filter.transfer',
  income: 'filter.income',
  refund: 'filter.refund',
  reversal: 'filter.reversal',
  loan: 'filter.loan',
  rebate: 'filter.rebate',
  tax: 'filter.tax',
  fee: 'filter.fee',
};

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

function buildAccountColumn(
  t: TFunction<'finance'>,
  accounts: AccountOption[]
): ColumnDef<Transaction> {
  return {
    accessorKey: 'accountId',
    header: t('column.account'),
    cell: ({ row }) => {
      const resolved = resolveAccountOption(accounts, row.original.accountId);
      if (!resolved) return <span className="text-sm font-mono">{row.original.account}</span>;
      return <AccountChip account={resolved} size="compact" />;
    },
  };
}

function buildCoreColumns(
  t: TFunction<'finance'>,
  accounts: AccountOption[]
): ColumnDef<Transaction>[] {
  const typeLabels: Record<string, string> = Object.fromEntries(
    TRANSACTION_TYPES.map((v) => [v, t(TYPE_LABEL_KEY[v])])
  );
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
    buildAccountColumn(t, accounts),
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
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="text-xs">
            {typeLabels[row.original.type] ?? labelForType(row.original.type)}
          </Badge>
          {row.original.relatedTransactionId ? (
            <Link2 className="h-3 w-3 text-muted-foreground" aria-label="Linked transfer" />
          ) : null}
        </div>
      ),
    },
  ];
}

function buildInteractiveColumns(args: BuildColumnsArgs): ColumnDef<Transaction>[] {
  const { t } = args;
  return [
    buildPurchaseLinkColumn({
      summaries: args.purchaseLinks,
      onShowPurchase: args.onShowPurchase,
    }),
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
      cell: ({ row }) => <RowActions transaction={row.original} t={t} handlers={args} />,
    },
  ];
}

export function buildColumns(args: BuildColumnsArgs): ColumnDef<Transaction>[] {
  return [...buildCoreColumns(args.t, args.accounts), ...buildInteractiveColumns(args)];
}

/**
 * Filter options sourced from the live accounts list rather than the
 * distinct account names seen in the currently loaded page of transactions —
 * an account with no transactions yet still shows up. Archived accounts are
 * excluded; there is no reveal-archived affordance on this plain `select`
 * filter type yet (follow-up ticket, POPS-2776).
 */
export function buildTransactionFilters(
  t: TFunction<'finance'>,
  accounts: AccountOption[]
): ColumnFilter[] {
  return [
    { id: 'date', type: 'daterange', label: t('filter.dateRange') },
    {
      id: 'accountId',
      type: 'select',
      label: t('filter.account'),
      options: [
        { label: t('filter.allAccounts'), value: '' },
        ...accounts
          .filter((account) => !account.archived)
          .map((account) => ({ label: account.name, value: account.id })),
      ],
    },
    {
      id: 'type',
      type: 'select',
      label: t('filter.type'),
      options: [
        { label: t('filter.allTypes'), value: '' },
        ...TRANSACTION_TYPES.map((value) => ({ label: t(TYPE_LABEL_KEY[value]), value })),
      ],
    },
    { id: 'tags', type: 'text', label: t('filter.tag'), placeholder: t('placeholder.filterByTag') },
  ];
}
