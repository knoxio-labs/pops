import { useParams } from 'react-router';

import { Alert, Button, EmptyState, Skeleton } from '@pops/ui';

import { EntityFormDialog } from './entities/EntityFormDialog';
import { EntityDetailHeader } from './entity-detail/EntityDetailHeader';
import { EntityFieldList } from './entity-detail/EntityFieldList';
import { RecentPurchasesCard } from './entity-detail/RecentPurchasesCard';
import { RecentTransactionsCard } from './entity-detail/RecentTransactionsCard';
import { useEntityDetailPage } from './entity-detail/useEntityDetailPage';

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <p className="font-semibold">Failed to load this entity</p>
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
        Try again
      </Button>
    </Alert>
  );
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}

/**
 * `/entities/:id` — the entity dashboard (POPS-3076). Banner-forward
 * identity header (avatar/poster/colour, POPS-3061), the contacts-owned
 * fields, then a recent-transactions and a recent-purchases rollup, each
 * fetched from its own pillar for this one entity.
 */
export function EntityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const entityId = id ?? '';
  const state = useEntityDetailPage(entityId);

  if (state.query.error) {
    return <ErrorPanel message={state.query.error.message} onRetry={() => state.query.refetch()} />;
  }
  if (state.isLoading) {
    return <LoadingSkeleton />;
  }
  const { entity } = state;
  if (!entity) {
    return <EmptyState title="No such entity" description="It may have been deleted." />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <EntityDetailHeader entity={entity} onEdit={state.openEdit} />
      <EntityFieldList entity={entity} />
      <div className="space-y-4">
        <RecentTransactionsCard entityId={entity.id} />
        <RecentPurchasesCard entityId={entity.id} />
      </div>
      <EntityFormDialog
        open={state.isDialogOpen}
        onOpenChange={state.setIsDialogOpen}
        editingEntity={state.editingEntity}
        form={state.form}
        isSubmitting={state.isSubmitting}
        onSubmit={state.onSubmit}
        uploadAvatar={state.uploadAvatar}
        removeAvatar={state.removeAvatar}
        avatarUploadIsPending={state.avatarUploadIsPending}
        avatarRemoveIsPending={state.avatarRemoveIsPending}
        rerollColour={state.rerollColour}
        colourRerollIsPending={state.colourRerollIsPending}
        onAvatarError={state.onAvatarError}
      />
    </div>
  );
}
