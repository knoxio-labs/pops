import { Alert, Badge, Button, CRUDManagementSection, PageHeader, Skeleton } from '@pops/ui';

import { CurrencyEditDialog } from './settings/CurrencyEditDialog';
import { DeleteCurrencyDialog } from './settings/DeleteCurrencyDialog';
import { SettingsRow } from './settings/SettingsRow';
import { useCurrenciesSettings } from './settings/useCurrenciesSettings';

import type { Currency } from './settings/types';

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

function CurrencyRow({
  currency,
  onEdit,
  onDelete,
}: {
  currency: Currency;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <SettingsRow
      leading={
        <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
          {currency.code}
        </span>
      }
      title={currency.name}
      subtitle={
        <span className="flex items-center gap-1.5">
          {currency.symbol ?? '—'} · {currency.decimals} decimals
          <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px] capitalize">
            {currency.kind}
          </Badge>
        </span>
      }
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}

function CurrenciesSection() {
  const state = useCurrenciesSettings();
  const { query } = state;

  if (query.error) return <SectionError message={query.error.message} onRetry={query.refetch} />;

  const items = query.data?.data ?? [];

  return (
    <>
      <CRUDManagementSection title="Currencies" description="What accounts are denominated in">
        {query.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          items.length === 0 && <p className="text-sm text-muted-foreground">No currencies yet.</p>
        )}
        {items.map((currency) => (
          <CurrencyRow
            key={currency.code}
            currency={currency}
            onEdit={() => state.handleEdit(currency)}
            onDelete={() => state.setDeletingCode(currency.code)}
          />
        ))}
      </CRUDManagementSection>
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
    </>
  );
}

/**
 * Manage currencies after they've been created inline from the account form
 * (POPS-2810). Edit and delete only — creation stays on the account form's
 * pickers.
 *
 * Row list in a `CRUDManagementSection`, not a searchable `DataTable`
 * (POPS-2843): this is a short, rarely-edited reference list — the design
 * playground's `finance/settings` screen models this decision, matching the
 * same shell the media pillar's `SourceManagementSection` already uses for
 * comparable small config lists.
 */
export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage currencies" />
      <CurrenciesSection />
    </div>
  );
}
