import { Alert, Button, DataTable, PageHeader, Skeleton } from '@pops/ui';

import { buildCurrencyColumns } from './settings/currency-columns';
import { CurrencyEditDialog } from './settings/CurrencyEditDialog';
import { DeleteCurrencyDialog } from './settings/DeleteCurrencyDialog';
import { DeleteInstitutionDialog } from './settings/DeleteInstitutionDialog';
import { buildInstitutionColumns } from './settings/institution-columns';
import { InstitutionEditDialog } from './settings/InstitutionEditDialog';
import { useCurrenciesSettings } from './settings/useCurrenciesSettings';
import { useInstitutionsSettings } from './settings/useInstitutionsSettings';

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive">
      <p className="font-semibold">Failed to load</p>
      <p className="text-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
        Try again
      </Button>
    </Alert>
  );
}

function InstitutionsSection() {
  const state = useInstitutionsSettings();
  const { query } = state;

  if (query.error) return <SectionError message={query.error.message} onRetry={query.refetch} />;

  const columns = buildInstitutionColumns({
    onEdit: state.handleEdit,
    onDelete: state.setDeletingId,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Institutions</h2>
      {query.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          searchable
          searchColumn="name"
          searchPlaceholder="Search institutions..."
        />
      )}
      <InstitutionEditDialog
        open={!!state.editing}
        onOpenChange={(v) => !v && state.setEditing(null)}
        form={state.form}
        isSubmitting={state.updateMutation.isPending}
        onSubmit={state.onSubmit}
      />
      <DeleteInstitutionDialog
        deletingId={state.deletingId}
        setDeletingId={state.setDeletingId}
        isDeleting={state.deleteMutation.isPending}
        onConfirm={(id) => state.deleteMutation.mutate(id)}
      />
    </div>
  );
}

function CurrenciesSection() {
  const state = useCurrenciesSettings();
  const { query } = state;

  if (query.error) return <SectionError message={query.error.message} onRetry={query.refetch} />;

  const columns = buildCurrencyColumns({
    onEdit: state.handleEdit,
    onDelete: state.setDeletingCode,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Currencies</h2>
      {query.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <DataTable
          columns={columns}
          data={query.data?.data ?? []}
          searchable
          searchColumn="name"
          searchPlaceholder="Search currencies..."
        />
      )}
      <CurrencyEditDialog
        open={!!state.editing}
        onOpenChange={(v) => !v && state.setEditing(null)}
        code={state.editing?.code ?? null}
        form={state.form}
        isSubmitting={state.updateMutation.isPending}
        onSubmit={state.onSubmit}
      />
      <DeleteCurrencyDialog
        deletingCode={state.deletingCode}
        setDeletingCode={state.setDeletingCode}
        isDeleting={state.deleteMutation.isPending}
        onConfirm={(code) => state.deleteMutation.mutate(code)}
      />
    </div>
  );
}

/**
 * Manage institutions and currencies after they've been created inline from
 * the account form (POPS-2810). Edit + delete only — creation stays on the
 * account form's pickers, and merging institutions / browsing an entity's
 * accounts before deleting are deferred (see the linked follow-up tickets).
 */
export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage institutions and currencies" />
      <InstitutionsSection />
      <CurrenciesSection />
    </div>
  );
}
