import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useSetPageContext } from '@pops/navigation';
import { Alert, Button, DataTable, PageHeader, Skeleton } from '@pops/ui';

import { buildWishlistColumns, WISHLIST_TABLE_FILTERS } from './wishlist/columns';
import { DeleteWishlistDialog } from './wishlist/DeleteWishlistDialog';
import { useWishlistPage } from './wishlist/useWishlistPage';
import { WishlistFormDialog } from './wishlist/WishlistFormDialog';

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation('finance');
  return (
    <div className="space-y-6">
      <PageHeader title={t('wishlist')} />
      <Alert variant="destructive">
        <p className="font-semibold">{t('wishlist.failedToLoad')}</p>
        <p className="text-sm">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
          {t('common:tryAgain')}
        </Button>
      </Alert>
    </div>
  );
}

export function WishlistPage() {
  const { t } = useTranslation('finance');
  useSetPageContext({ page: 'wishlist' });
  const state = useWishlistPage();
  const { query } = state;

  if (query.error)
    return <ErrorPanel message={query.error.message} onRetry={() => query.refetch()} />;

  const columns = buildWishlistColumns({ onEdit: state.handleEdit, onDelete: state.setDeletingId });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('wishlist')}
        description={
          query.data
            ? t('wishlist.totalCount', { count: query.data.pagination.total })
            : t('wishlist.trackingGoals')
        }
        actions={
          <Button onClick={state.handleAdd} prefix={<Plus className="h-4 w-4" />}>
            {t('wishlist.addItem')}
          </Button>
        }
      />
      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          searchable
          searchColumn="item"
          searchPlaceholder={t('wishlist.searchPlaceholder')}
          paginated
          defaultPageSize={50}
          filters={WISHLIST_TABLE_FILTERS}
        />
      )}
      <WishlistFormDialog
        open={state.isDialogOpen}
        onOpenChange={state.setIsDialogOpen}
        editingItem={state.editingItem}
        form={state.form}
        isSubmitting={state.isSubmitting}
        onSubmit={state.onSubmit}
      />
      <DeleteWishlistDialog
        deletingId={state.deletingId}
        setDeletingId={state.setDeletingId}
        isDeleting={state.deleteMutation.isPending}
        onConfirm={(id) => state.deleteMutation.mutate({ id })}
      />
    </div>
  );
}
