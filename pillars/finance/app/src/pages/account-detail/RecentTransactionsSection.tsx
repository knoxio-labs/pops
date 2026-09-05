import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { formatBalance, type CurrencyKind } from '@pops/finance';
import {
  Button,
  EmptyState,
  formatDate,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import { unwrap } from '../../finance-api-helpers.js';
import { transactionsList } from '../../finance-api/index.js';

import type { TransactionsListResponse } from '../../finance-api/index.js';

type Transaction = NonNullable<TransactionsListResponse['data']>[number];

/** The 6 most recent transactions for one account — `transactions.list` sorts `date DESC, id DESC` by default. */
const RECENT_LIMIT = 6;

export function useRecentTransactions(accountId: string) {
  return useQuery({
    queryKey: ['finance', 'transactions', 'byAccount', accountId, RECENT_LIMIT],
    queryFn: async () =>
      unwrap(await transactionsList({ query: { accountId, limit: RECENT_LIMIT } })),
  });
}

function Row({
  transaction,
  currency,
}: {
  transaction: Transaction;
  currency: { symbol: string | null; decimals: number; kind: CurrencyKind };
}) {
  return (
    <TableRow>
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {formatDate(transaction.date)}
      </TableCell>
      <TableCell className="text-sm">
        {transaction.description}
        {transaction.entityName ? ` · ${transaction.entityName}` : ''}
      </TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {formatBalance(transaction.amount, currency)}
      </TableCell>
    </TableRow>
  );
}

export function RecentTransactionsSection({
  accountId,
  currency,
}: {
  accountId: string;
  currency: { symbol: string | null; decimals: number; kind: CurrencyKind };
}) {
  const query = useRecentTransactions(accountId);
  const transactions = query.data?.data ?? [];

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Recent transactions
        </h2>
        <Button variant="link" size="sm" asChild>
          <Link to={`/finance/transactions?account=${accountId}`}>View all</Link>
        </Button>
      </div>
      {query.isLoading && <Skeleton className="h-40 w-full" />}
      {!query.isLoading && transactions.length === 0 && (
        <EmptyState title="No transactions yet" description="Nothing has posted to this account." />
      )}
      {!query.isLoading && transactions.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.map((transaction) => (
              <Row key={transaction.id} transaction={transaction} currency={currency} />
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
