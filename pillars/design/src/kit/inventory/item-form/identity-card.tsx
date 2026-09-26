/**
 * The left-hand card: what every item has, in Tab order. Name, type and
 * code first, because they decide what the rest of the form shows; then
 * how many and where; then the note and photos.
 */
import { Card, CardContent } from '@pops/ui';

import { CodeField } from './code-field';
import { PlaceField, QuantityField } from './count-and-place';
import { NameField, TypeField } from './identity-fields';
import { PhotosField } from './photos-field';

import type { ItemRowModel } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';
import type { ItemDraft } from './form-draft';
import type { FormOverlay, ItemFormContext, TypePickerState } from './form-opening';
import type { ItemFormApi } from './use-item-form';

/** Props for {@link IdentityCard}. */
export interface IdentityCardProps {
  api: ItemFormApi;
  context: ItemFormContext;
  /** The type the item was opened with; an item that has a type cannot lose it. */
  openedTypeId: string | null;
  /** The item's id when editing; a new item is placed as a draft. */
  editingId?: string;
  overlay?: FormOverlay;
  typePicker?: TypePickerState;
}

const DRAFT_ID = 'draft-item';

function worldWithDraft(
  context: ItemFormContext,
  draft: ItemDraft,
  itemId: string
): PlacementWorld {
  const existing = context.world.items.get(itemId);
  const row: ItemRowModel = {
    id: itemId,
    name: draft.name.trim() === '' ? 'New item' : draft.name,
    typeId: draft.typeId,
    typeName: null,
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '',
    ...existing,
    placement: draft.placement,
  };
  return { ...context.world, items: new Map(context.world.items).set(itemId, row) };
}

function CountAndPlace({ api, context, overlay, editingId }: IdentityCardProps) {
  const { draft, view, dispatch } = api;
  const itemId = editingId ?? DRAFT_ID;
  return (
    <>
      <PlaceField
        world={worldWithDraft(context, draft, itemId)}
        itemId={itemId}
        placement={draft.placement}
        recents={context.recents}
        onChange={(placement) => dispatch({ type: 'placement', placement })}
        pickerOpen={overlay?.kind === 'place-picker'}
      />
      {view.showQuantity ? (
        <QuantityField
          value={draft.quantity}
          error={view.quantityError}
          onChange={(value) => dispatch({ type: 'quantity', value })}
        />
      ) : null}
    </>
  );
}

/** The card. */
export function IdentityCard(props: IdentityCardProps) {
  const { api, context } = props;
  const { draft, view, dispatch } = api;
  return (
    <Card className="min-h-0 py-0">
      <CardContent className="flex flex-col gap-3.5 p-5 lg:h-full lg:min-h-0">
        <NameField
          value={draft.name}
          error={view.nameError}
          autoFocus={draft.mode === 'create' && props.overlay === undefined}
          onChange={(value) => dispatch({ type: 'name', value })}
        />
        <TypeField
          types={context.types}
          typeId={draft.typeId}
          offerNone={props.openedTypeId === null}
          onChange={(type) =>
            dispatch({
              type: 'type',
              typeId: type?.id ?? null,
              containment: type?.containment ?? false,
            })
          }
          treeOpen={props.typePicker?.open}
          treeQuery={props.typePicker?.query}
        />
        <CodeField
          entry={draft.code}
          typeLabel={view.type?.label ?? null}
          onType={api.typeCode}
          onSuggest={api.suggestCode}
          onAccept={() => dispatch({ type: 'code', action: { type: 'accept' } })}
        />
        <CountAndPlace {...props} />
        <PhotosField
          photos={api.photos}
          refused={api.refusedPhotos}
          onAdd={() => undefined}
          onRemove={api.removePhoto}
          onRetry={api.retryPhoto}
        />
      </CardContent>
    </Card>
  );
}
