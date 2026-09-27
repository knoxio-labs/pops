import { FolderPlus, MoreHorizontal, MoveRight, PackagePlus, Pencil, Trash2 } from 'lucide-react';

import { Button, ButtonPrimitive, DropdownMenu } from '@pops/ui';

import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { PlacementPicker } from '../../foundation/placement-picker/placement-picker.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceEditsApi } from './location-page-parts.js';

function DisabledAction({
  label,
  reason,
  icon: Icon,
}: {
  label: string;
  reason: string;
  icon: LucideIcon;
}): ReactElement {
  return (
    <HintTooltip label={label} disabledReason={reason}>
      <Button variant="ghost" size="sm" disabled prefix={<Icon className="size-4" aria-hidden />}>
        {label}
      </Button>
    </HintTooltip>
  );
}

function PlaceMenu({ place, edits }: { place: LocationModel; edits: PlaceEditsApi }): ReactElement {
  return (
    <DropdownMenu
      trigger={
        <ButtonPrimitive variant="ghost" size="icon-sm" aria-label={`Actions for ${place.name}`}>
          <MoreHorizontal className="size-4" aria-hidden />
        </ButtonPrimitive>
      }
      items={[
        {
          label: 'Rename',
          value: 'rename',
          icon: <Pencil className="size-4" aria-hidden />,
          onSelect: () => edits.startRename(place.id),
        },
        {
          label: 'Delete',
          value: 'delete',
          variant: 'destructive',
          icon: <Trash2 className="size-4" aria-hidden />,
          onSelect: () => edits.requestDelete(place.id),
        },
      ]}
    />
  );
}

/** Props for the location-page primary place actions. */
export interface PlaceActionsProps {
  place: LocationModel;
  world: PlacementWorld;
  edits: PlaceEditsApi;
  movingPlace: boolean;
  setMovingPlace: (open: boolean) => void;
  showPlaces: () => void;
  onStoreHere: () => void;
  offline: boolean;
}

/** Renders New place inside, Move, Store here, and the place menu. */
export function PlaceActions({
  place,
  world,
  edits,
  movingPlace,
  setMovingPlace,
  showPlaces,
  onStoreHere,
  offline,
}: PlaceActionsProps): ReactElement {
  const offlineReason = OFFLINE_REASON;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {offline ? (
        <DisabledAction label="New place inside" reason={offlineReason} icon={FolderPlus} />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            showPlaces();
            edits.startCreate(place.id);
          }}
          prefix={<FolderPlus className="size-4" aria-hidden />}
        >
          New place inside
        </Button>
      )}
      <PlacementPicker
        world={world}
        subject={{ kind: 'place', locationId: place.id }}
        recents={[]}
        open={movingPlace}
        onOpenChange={setMovingPlace}
        onPick={(target) => {
          if (target.kind !== 'location') return;
          edits.moveTo(place.id, target.locationId);
          setMovingPlace(false);
        }}
        trigger={
          offline ? (
            <DisabledAction label="Move" reason={offlineReason} icon={MoveRight} />
          ) : (
            <Button variant="ghost" size="sm" prefix={<MoveRight className="size-4" aria-hidden />}>
              Move
            </Button>
          )
        }
      />
      {offline ? (
        <DisabledAction label="Store here" reason={offlineReason} icon={PackagePlus} />
      ) : (
        <Button onClick={onStoreHere} prefix={<PackagePlus className="size-4" aria-hidden />}>
          Store here
        </Button>
      )}
      {offline ? null : <PlaceMenu place={place} edits={edits} />}
    </div>
  );
}
