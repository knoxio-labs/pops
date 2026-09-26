/**
 * The two ways the Locations page opens the placement picker: the Move
 * button on a place (places only, never into itself), and a Move for the
 * selected things, which anchors under the list it came from.
 */
import { useMemo } from 'react';

import { Button } from '@pops/ui';

import { INVENTORY_ICONS, PlacementPicker, ShortcutHint } from '../foundation';

import type { LocationModel, PlacementTarget, PlacementWorld } from '../foundation';
import type { ItemActionsApi } from '../location-page/use-item-actions';

/** The Move button for one place, with the picker on it. */
export function MovePlaceButton({
  world,
  place,
  open,
  onOpenChange,
  onPick,
}: {
  world: PlacementWorld;
  place: LocationModel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (parentId: string) => void;
}) {
  const subject = useMemo(() => ({ kind: 'place' as const, locationId: place.id }), [place.id]);
  return (
    <PlacementPicker
      world={world}
      subject={subject}
      recents={[]}
      open={open}
      onOpenChange={onOpenChange}
      initialDrillId={place.parentId}
      onPick={(target) => {
        if (target.kind === 'location') onPick(target.locationId);
        onOpenChange(false);
      }}
      trigger={
        <Button
          size="sm"
          variant="ghost"
          prefix={<INVENTORY_ICONS.move className="size-4" aria-hidden />}
          suffix={<ShortcutHint id="move" />}
        >
          Move
        </Button>
      }
    />
  );
}

/** The picker for a Move of things, anchored low in the content. */
export function MoveItemsAnchor({
  world,
  verbs,
  recents,
}: {
  world: PlacementWorld;
  verbs: ItemActionsApi;
  recents: readonly PlacementTarget[];
}) {
  const ids = verbs.moving;
  const subject = useMemo(() => ({ kind: 'items' as const, ids: ids ?? [] }), [ids]);
  return (
    <PlacementPicker
      world={world}
      subject={subject}
      recents={recents}
      open={ids !== null}
      onOpenChange={(open) => {
        if (!open) verbs.cancelMove();
      }}
      onPick={verbs.moveTo}
      trigger={<span aria-hidden className="fixed right-1/3 bottom-28 size-px" />}
    />
  );
}
