import { useQuery } from '@tanstack/react-query';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
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
import { AmountCell } from '../transactions/cells';

import type { TransactionsListResponse } from '../../finance-api/index.js';

type Transaction = NonNullable<TransactionsListResponse['data']>[number];

/** `transactions.list` sorts `date DESC, id DESC` by default. */
const RECENT_LIMIT = 6;

export function useRecentTransactionsForEntity(entityId: string) {
  return useQuery({
    queryKey: ['finance', 'transactions', 'byEntity', entityId, RECENT_LIMIT],
    queryFn: async () =>
      unwrap(await transactionsList({ query: { entityId, limit: RECENT_LIMIT } })),
  });
}

function Row({ transaction }: { transaction: Transaction }) {
  return (
    <TableRow>
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {formatDate(transaction.date)}
      </TableCell>
      <TableCell className="text-sm">{transaction.description}</TableCell>
      <TableCell className="text-right">
        <AmountCell amount={transaction.amount} />
      </TableCell>
    </TableRow>
  );
}

/**
 * The entity's recent transactions, read from finance by `entityId`
 * (POPS-3076). Empty is its own state, not hidden — a brand-new entity has
 * simply never posted one yet.
 */
export function RecentTransactionsCard({ entityId }: { entityId: string }) {
  const query = useRecentTransactionsForEntity(entityId);
  const transactions = query.data?.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent transactions</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading && <Skeleton className="h-24 w-full" />}
        {!query.isLoading && transactions.length === 0 && (
          <EmptyState
            title="No transactions yet"
            description="No transactions matched to this entity yet."
          />
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
                <Row key={transaction.id} transaction={transaction} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
