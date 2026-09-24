import { Alert, AlertDescription, AlertTitle, PageHeader } from '@pops/ui';

import { RecentPurchasesCard } from './RecentPurchasesCard';
import { RecentTransactionsCard, useRecentTransactionsForEntity } from './RecentTransactionsCard';

/**
 * `/entities/:id` while contacts cannot be reached: what finance and
 * purchases hold about the entity, without the parts only contacts has.
 *
 * The name is the one finance stored with the entity's transactions, which is
 * also what the transactions table shows for them — so the page and the table
 * agree while contacts is down. The profile header, fields and edit form are
 * contacts' and are left out rather than rendered empty.
 */
export function ContactsUnavailableView({ entityId }: { entityId: string }) {
  const transactions = useRecentTransactionsForEntity(entityId);
  const storedName = transactions.data?.data.find((t) => t.entityName !== null)?.entityName;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <PageHeader title={storedName ?? 'Entity'} />
      <Alert>
        <AlertTitle>Contact details are unavailable</AlertTitle>
        <AlertDescription>
          <p>
            Contacts could not be reached. The name is the one finance stored with this entity’s
            transactions.
          </p>
        </AlertDescription>
      </Alert>
      <div className="space-y-4">
        <RecentTransactionsCard entityId={entityId} />
        <RecentPurchasesCard entityId={entityId} />
      </div>
    </div>
  );
}
