/**
 * The item form page, one component for `/inventory/items/new` and
 * `/inventory/items/:id/edit`: the header with its verbs, a banner when
 * something outside the form matters, what every item has on the left and
 * the type's fields on the right. Only the field list scrolls.
 */
import { CancelDialog } from './cancel-dialog';
import { FieldsCard } from './fields-card';
import { FormBanner } from './form-banners';
import { FormHeader } from './form-header';
import { IdentityCard } from './identity-card';
import { useItemForm } from './use-item-form';

import type { ItemFormContext, ItemFormOpening } from './form-opening';

/** Props for {@link ItemFormPage}. */
export interface ItemFormPageProps {
  opening: ItemFormOpening;
  context: ItemFormContext;
}

function blockedReason(offline: boolean, blockers: readonly string[]): string | null {
  if (offline) return 'No connection.';
  return blockers[0] ?? null;
}

/** The page. */
export function ItemFormPage({ opening, context }: ItemFormPageProps) {
  const api = useItemForm(opening, context);
  const { draft, view } = api;
  const staged = api.photos.filter((photo) => photo.status.kind === 'staged').length;
  return (
    <div
      className="flex flex-col gap-4 lg:h-[calc(100vh-8rem)] lg:min-h-0"
      onKeyDown={api.onKeyDown}
    >
      <FormHeader
        mode={draft.mode}
        editingName={opening.editing?.name}
        container={view.type?.containment === true}
        saving={opening.phase === 'saving'}
        blocked={blockedReason(api.offline, view.blockers)}
        onCancel={api.requestCancel}
        onSave={api.save}
      />
      <FormBanner opening={opening} name={opening.editing?.name ?? draft.name} />
      <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <IdentityCard
          api={api}
          context={context}
          openedTypeId={opening.draft.mode === 'edit' ? opening.draft.typeId : null}
          editingId={opening.editing?.id}
          overlay={opening.overlay}
        />
        <FieldsCard
          draft={draft}
          view={view}
          context={context}
          computed={opening.computed ?? {}}
          dispatch={api.dispatch}
          overlay={opening.overlay}
        />
      </div>
      <CancelDialog
        open={api.cancelAsked}
        mode={draft.mode}
        stagedPhotos={staged}
        onOpenChange={api.setCancelAsked}
        onDiscard={() => api.setCancelAsked(false)}
      />
    </div>
  );
}
