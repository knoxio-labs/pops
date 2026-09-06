import { formatBalance } from '@/fixtures/currencies';
import {
  recentPurchasesByEntity,
  recentTransactionsByEntity,
  type RecentPurchase,
  type RecentTransaction,
} from '@/fixtures/entity-activity';

import { Card, CardContent, CardHeader, CardTitle } from '@pops/ui';

import type { Entity } from '@/fixtures/entities';

function day(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  });
}

function ActivityRow({
  date,
  label,
  amountCents,
}: {
  date: string;
  label: string;
  amountCents: number;
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="min-w-0 flex-1">
        <p className="truncate">{label}</p>
        <p className="text-xs text-muted-foreground">{day(date)}</p>
      </div>
      <p className="tabular-nums">{formatBalance(amountCents, 'AUD')}</p>
    </div>
  );
}

/**
 * Recent transactions and recent purchases: each a call to a different
 * pillar, made once for the one entity this page is showing. Either can come
 * back empty — a brand-new entity, or one that simply never bought anything
 * through purchases — and an empty rollup is still informative, so it gets a
 * sentence rather than being hidden.
 */
export function EntityActivity({ entity }: { entity: Entity }) {
  const transactions: RecentTransaction[] = recentTransactionsByEntity[entity.id] ?? [];
  const purchases: RecentPurchase[] = recentPurchasesByEntity[entity.id] ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No transactions matched to this entity yet.
            </p>
          ) : (
            <div className="divide-y">
              {transactions.map((t) => (
                <ActivityRow
                  key={t.id}
                  date={t.date}
                  label={t.description}
                  amountCents={t.amountCents}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent purchases</CardTitle>
        </CardHeader>
        <CardContent>
          {purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases linked to this entity.</p>
          ) : (
            <div className="divide-y">
              {purchases.map((p) => (
                <ActivityRow key={p.id} date={p.date} label={p.item} amountCents={p.amountCents} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
