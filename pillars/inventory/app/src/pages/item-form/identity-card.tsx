import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Card, CardContent, CardHeader, CardTitle } from '@pops/ui';

import { buildWorld } from '../../foundation/model/placement-model';
import { CodeField } from './code-field';
import { CountAndPlace } from './count-and-place';
import { draftRow } from './form-opening';
import { IdentityFields } from './identity-fields';

import type { ReactElement } from 'react';

import type { PlacementTarget } from '../../foundation/model/model';
import type { PlacementWorld } from '../../foundation/model/placement-model';
import type { FormSources } from './use-form-sources';
import type { ItemFormApi } from './use-item-form';

function placementFromTarget(target: PlacementTarget) {
  if (target.kind === 'container')
    return { kind: 'container' as const, containerId: target.containerId };
  return target;
}

function formWorld(
  api: ItemFormApi,
  sources: FormSources,
  editingId: string | undefined
): PlacementWorld {
  const row = draftRow(api.draft, api.view.type);
  const items = [...sources.world.items.values()].filter(
    (item) => item.id !== 'draft-item' && item.id !== editingId
  );
  items.push({ ...row, id: editingId ?? 'draft-item' });
  return buildWorld(items, [...sources.world.locations.values()]);
}

function IdentityControls({
  api,
  sources,
  allowNoType,
}: {
  api: ItemFormApi;
  sources: FormSources;
  allowNoType: boolean;
}): ReactElement {
  return (
    <>
      <IdentityFields
        draft={api.draft}
        type={api.view.type}
        types={sources.types}
        allowNoType={allowNoType}
        nameError={api.view.nameError}
        dispatch={api.dispatch}
      />
      <CodeField
        entry={api.draft.code}
        onType={api.typeCode}
        onSuggest={api.suggestCode}
        onAcceptOffered={() => api.dispatch({ type: 'code', action: { type: 'accept-offered' } })}
        offline={api.offline}
        nothingToSuggestFrom={api.draft.name.trim() === '' && api.draft.typeId === null}
      />
    </>
  );
}

function IdentityCardContent({
  api,
  sources,
  world,
  editingId,
  allowNoType,
  pickerOpen,
  setPickerOpen,
}: {
  api: ItemFormApi;
  sources: FormSources;
  world: PlacementWorld;
  editingId?: string;
  allowNoType: boolean;
  pickerOpen: boolean;
  setPickerOpen: (open: boolean) => void;
}): ReactElement {
  const onCreatePlace = (name: string, parentId: string | null): void => {
    void sources
      .createLocation(name, parentId)
      .catch(() => toast.error('Not saved. The inventory service did not answer.'));
  };
  const onPick = (target: PlacementTarget): void => {
    setPickerOpen(false);
    api.dispatch({ type: 'placement', placement: placementFromTarget(target) });
  };
  return (
    <CardContent className="space-y-6">
      <IdentityControls api={api} sources={sources} allowNoType={allowNoType} />
      <CountAndPlace
        quantity={api.draft.quantity}
        showQuantity={api.view.showQuantity}
        quantityError={api.view.quantityError}
        placement={api.draft.placement}
        world={world}
        recents={sources.recents}
        subjectId={editingId ?? 'draft-item'}
        pickerOpen={pickerOpen}
        onPickerOpenChange={setPickerOpen}
        onQuantity={(value) => api.dispatch({ type: 'quantity', value })}
        onPick={onPick}
        onCreatePlace={onCreatePlace}
      />
    </CardContent>
  );
}

/** Props for the form's identity and placement card. */
export interface IdentityCardProps {
  readonly api: ItemFormApi;
  readonly sources: FormSources;
  readonly openedTypeId: string | null;
  readonly editingId?: string;
}

/** Renders name, type, code, quantity, placement and note controls. */
export function IdentityCard({
  api,
  sources,
  openedTypeId,
  editingId,
}: IdentityCardProps): ReactElement {
  const [pickerOpen, setPickerOpen] = useState(false);
  const world = useMemo(() => formWorld(api, sources, editingId), [api, editingId, sources]);
  return (
    <Card data-opened-type-id={openedTypeId ?? undefined}>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
      </CardHeader>
      <IdentityCardContent
        api={api}
        sources={sources}
        world={world}
        editingId={editingId}
        allowNoType={openedTypeId === null}
        pickerOpen={pickerOpen}
        setPickerOpen={setPickerOpen}
      />
    </Card>
  );
}
