import { useQuery } from '@tanstack/react-query';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  formatCents,
  formatDate,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@pops/ui';

import { isUnavailableError, unwrap } from '../../purchases-api-helpers.js';
import { purchaseList } from '../../purchases-api/index.js';

import type { PurchaseListResponse } from '../../purchases-api/index.js';

type Purchase = NonNullable<PurchaseListResponse['items']>[number];

const RECENT_LIMIT = 6;

/**
 * The entity's recent purchases, read from the purchases pillar by
 * `merchantEntityId` (POPS-3076). `retry: false`, same reasoning as
 * `usePurchasesForTransaction`: a sibling pillar being down should surface
 * once, not hold this card's skeleton up for three retries.
 */
export function useRecentPurchasesForEntity(entityId: string) {
  return useQuery({
    retry: false,
    queryKey: ['purchases', 'byMerchantEntity', entityId, RECENT_LIMIT],
    queryFn: async () =>
      unwrap(await purchaseList({ query: { merchantEntityId: entityId, limit: RECENT_LIMIT } })),
  });
}

function Row({ purchase }: { purchase: Purchase }) {
  return (
    <TableRow>
      <TableCell className="text-xs tabular-nums text-muted-foreground">
        {formatDate(purchase.orderedAt)}
      </TableCell>
      <TableCell className="text-sm capitalize">{purchase.source}</TableCell>
      <TableCell className="text-right text-sm tabular-nums">
        {formatCents(purchase.totalCents, purchase.currency)}
      </TableCell>
    </TableRow>
  );
}

function emptyMessage(isUnavailable: boolean): string {
  return isUnavailable
    ? 'Purchases could not be reached right now.'
    : 'No purchases linked to this entity.';
}

/** Own empty state whether the rollup is genuinely empty or the pillar is unreachable — either way there is nothing to list, just a different reason. */
export function RecentPurchasesCard({ entityId }: { entityId: string }) {
  const query = useRecentPurchasesForEntity(entityId);
  const isUnavailable = isUnavailableError(query.error);
  const purchases = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Recent purchases</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading && <Skeleton className="h-24 w-full" />}
        {!query.isLoading && purchases.length === 0 && (
          <EmptyState title="No purchases" description={emptyMessage(isUnavailable)} />
        )}
        {!query.isLoading && purchases.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.map((purchase) => (
                <Row key={purchase.id} purchase={purchase} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
