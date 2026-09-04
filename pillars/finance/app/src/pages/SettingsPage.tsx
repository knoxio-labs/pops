import { Alert, Badge, Button, CRUDManagementSection, PageHeader, Skeleton } from '@pops/ui';

import { CurrencyEditDialog } from './settings/CurrencyEditDialog';
import { DeleteCurrencyDialog } from './settings/DeleteCurrencyDialog';
import { DeleteInstitutionDialog } from './settings/DeleteInstitutionDialog';
import { InstitutionEditDialog } from './settings/InstitutionEditDialog';
import { SettingsRow } from './settings/SettingsRow';
import { useCurrenciesSettings } from './settings/useCurrenciesSettings';
import { useInstitutionsSettings } from './settings/useInstitutionsSettings';

import type { Currency, Institution } from './settings/types';

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

function InstitutionRow({
  institution,
  onEdit,
  onDelete,
}: {
  institution: Institution;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <SettingsRow
      leading={
        <span
          className="inline-block h-4 w-4 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: institution.colour }}
          aria-hidden="true"
        />
      }
      title={institution.name}
      subtitle={institution.colour}
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}

function InstitutionsSection() {
  const state = useInstitutionsSettings();
  const { query } = state;

  if (query.error) return <SectionError message={query.error.message} onRetry={query.refetch} />;

  const items = query.data?.data ?? [];

  return (
    <>
      <CRUDManagementSection title="Institutions" description="Where accounts are held">
        {query.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          items.length === 0 && (
            <p className="text-sm text-muted-foreground">No institutions yet.</p>
          )
        )}
        {items.map((institution) => (
          <InstitutionRow
            key={institution.id}
            institution={institution}
            onEdit={() => state.handleEdit(institution)}
            onDelete={() => state.setDeletingId(institution.id)}
          />
        ))}
      </CRUDManagementSection>
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
    </>
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
 * Manage institutions and currencies after they've been created inline from
 * the account form (POPS-2810). Edit + delete only — creation stays on the
 * account form's pickers, and merging institutions / browsing an entity's
 * accounts before deleting are deferred (see the linked follow-up tickets).
 *
 * Row list in a `CRUDManagementSection`, not a searchable `DataTable`
 * (POPS-2843): these are short, rarely-edited reference lists — the design
 * playground's `finance/settings` screen models this decision, matching the
 * same shell the media pillar's `SourceManagementSection` already uses for
 * comparable small config lists.
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
