import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';

import { webItemDetailQueryKey } from '../../inventory-web/queryKeys.js';
import { useChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';
import { CancelDialog } from './cancel-dialog';
import { FieldsCard } from './fields-card';
import { FormBanners } from './form-banners';
import { FormHeader } from './form-header';
import { createOpening, editOpening } from './form-opening';
import { FormLoadError, FormSkeleton } from './form-skeleton';
import { IdentityCard } from './identity-card';
import { useFormSources } from './use-form-sources';
import { useItemForm } from './use-item-form';

import type { ReactElement } from 'react';

import type { ItemFormOpening } from './form-opening';
import type { ItemFormApi, JustCreated } from './use-item-form';

function staleTitle(name: string, actor: string | null, changedAt: string): string {
  const elapsed = Math.max(0, Date.now() - new Date(changedAt).getTime());
  const minutes = Math.max(1, Math.round(elapsed / 60_000));
  const age =
    elapsed < 60_000
      ? `${Math.max(1, Math.round(elapsed / 1_000))} second${elapsed < 1_500 ? '' : 's'} ago`
      : `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  return `${name} changed on ${actor ?? 'another device'} ${age}.`;
}

function displayName(name: string, fallback: string): string {
  return name.trim() === '' ? fallback : name;
}

function blockedReason(offline: boolean, blockers: readonly string[]): string | null {
  if (offline) return 'No connection.';
  return blockers[0] ?? null;
}

function saveErrorBanner(api: ItemFormApi): { title: string; onRetry: () => void } | null {
  if (api.saveError === null) return null;
  const title =
    api.saveError.kind === 'failed'
      ? 'Not saved. The inventory service did not answer.'
      : `Not saved. ${api.saveError.message}`;
  return { title, onRetry: api.save };
}

function staleBannerFor(
  api: ItemFormApi,
  opening: ItemFormOpening,
  stale: ReturnType<typeof useChangedElsewhere>,
  itemId: string | undefined
): {
  title: string;
  groups: ReturnType<typeof useChangedElsewhere>['groups'];
  onReload: () => void;
} | null {
  const group = stale.groups[0];
  if (!stale.stale || group === undefined || itemId === undefined) return null;
  return {
    title: staleTitle(
      displayName(api.draft.name, opening.editing?.name ?? 'This item'),
      group.actorLabel,
      group.latestServerTime
    ),
    groups: stale.groups,
    onReload: () => void stale.reload(),
  };
}

function justCreatedFor(
  api: ItemFormApi,
  navigate: ReturnType<typeof useNavigate>
): (JustCreated & { onOpen: () => void }) | null {
  if (api.justCreated === null) return null;
  const created = api.justCreated;
  return {
    ...created,
    onOpen: () => void navigate(`/inventory/items/${created.itemId}`),
  };
}

function openingFor(
  id: string | undefined,
  search: string,
  sources: ReturnType<typeof useFormSources>
): ItemFormOpening {
  if (id !== undefined && sources.item !== null && sources.catalogue !== undefined)
    return editOpening(sources.item, sources.catalogue);
  return createOpening(new URLSearchParams(search), sources.world, sources.catalogue);
}

function loadErrorCopy(
  id: string | undefined,
  sources: ReturnType<typeof useFormSources>
): { readonly title: string; readonly subject: string } {
  if (id === undefined) return { title: 'New item', subject: 'the item types' };
  if (sources.item === null) return { title: 'Edit item', subject: 'the item' };
  return { title: `Edit ${sources.item.name}`, subject: sources.item.name };
}

function FormCards({
  api,
  opening,
  sources,
}: {
  api: ReturnType<typeof useItemForm>;
  opening: ItemFormOpening;
  sources: ReturnType<typeof useFormSources>;
}): ReactElement {
  const [searchQuery, setSearchQuery] = useState('');
  return (
    <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <IdentityCard
        api={api}
        sources={sources}
        openedTypeId={opening.draft.mode === 'edit' ? opening.draft.typeId : null}
        editingId={opening.editing?.id}
      />
      <div className="min-w-0 space-y-4 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto lg:pr-1">
        <FieldsCard
          draft={api.draft}
          view={api.view}
          computed={opening.computed}
          dispatch={api.dispatch}
          onReferenceQuery={setSearchQuery}
        />
        <p className="px-1 text-xs text-muted-foreground" aria-live="polite">
          {searchQuery === ''
            ? 'Fields are saved with this item.'
            : `Searching references for “${searchQuery}”.`}
        </p>
      </div>
    </div>
  );
}

function FormContent({
  opening,
  sources,
  itemId,
}: {
  opening: ItemFormOpening;
  sources: ReturnType<typeof useFormSources>;
  itemId: string | undefined;
}): ReactElement {
  const navigate = useNavigate();
  const api = useItemForm(opening, sources);
  const stale = useChangedElsewhere({
    queryKeys: itemId === undefined ? [] : [webItemDetailQueryKey(itemId)],
    entityId: itemId,
    enabled: itemId !== undefined && sources.status === 'success',
  });
  const saveError = saveErrorBanner(api);
  const staleBanner = staleBannerFor(api, opening, stale, itemId);
  const justCreated = justCreatedFor(api, navigate);
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 sm:p-6 lg:min-h-[calc(100vh-8rem)]">
      <FormHeader
        mode={api.draft.mode}
        editingName={opening.editing?.name ?? null}
        saving={api.saving}
        blocked={blockedReason(api.offline, api.view.blockers)}
        onCancel={api.requestCancel}
        onSave={api.save}
        onSaveAndNew={api.saveAndNew}
      />
      <FormBanners
        offline={api.offline}
        stale={staleBanner}
        saveError={saveError}
        justCreated={justCreated}
      />
      <FormCards api={api} opening={opening} sources={sources} />
      <CancelDialog
        open={api.cancelAsked}
        mode={api.draft.mode}
        onOpenChange={api.setCancelAsked}
        onDiscard={api.discard}
      />
    </div>
  );
}

/** Loads and renders the new-model create or edit item form route. */
export function ItemFormPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const sources = useFormSources(id);
  const opening = useMemo(
    () => openingFor(id, location.search, sources),
    [id, location.search, sources]
  );

  if (sources.status === 'pending') return <FormSkeleton />;
  if (sources.status === 'error') {
    const errorCopy = loadErrorCopy(id, sources);
    return <FormLoadError {...errorCopy} onRetry={sources.retry} />;
  }
  if (id !== undefined && sources.item === null)
    return <FormLoadError title="Item not found" subject="this item" onRetry={sources.retry} />;
  return (
    <FormContent
      key={`${id ?? 'new'}:${sources.item?.updatedAt ?? 'blank'}`}
      opening={opening}
      sources={sources}
      itemId={id}
    />
  );
}
