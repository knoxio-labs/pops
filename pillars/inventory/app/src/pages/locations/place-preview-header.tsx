import { ArrowUpRight, MoveRight, PackagePlus } from 'lucide-react';

import { Button } from '@pops/ui';

import { PlacementPath } from '../../foundation/badges/placement-path.js';
import { OFFLINE_REASON } from '../../foundation/feedback/state-banner.js';
import { PlacementPicker } from '../../foundation/placement-picker/placement-picker.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint.js';
import { placeSummary } from '../location-page/location-page-parts.js';
import { PlaceMenu } from './place-menu.js';
import { PLACE_ICONS } from './tree-row.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import type { LocationModel, PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';
import type { LocationEdits } from './location-tree.js';

/** Props for the selected-place preview header. */
export interface PreviewHeaderProps {
  readonly place: LocationModel;
  readonly world: PlacementWorld;
  readonly tally: PlaceTally;
  readonly edits: LocationEdits;
  readonly offline: boolean;
  readonly movingPlace: boolean;
  readonly onMovingPlaceChange: (open: boolean) => void;
  readonly onOpen: () => void;
  readonly onStoreHere: () => void;
}

function DisabledAction({ label, icon: Icon }: { label: string; icon: LucideIcon }): ReactElement {
  return (
    <HintTooltip label={label} disabledReason={OFFLINE_REASON}>
      <Button
        variant="ghost"
        size="sm"
        disabled
        aria-disabled="true"
        prefix={<Icon className="size-4" aria-hidden />}
      >
        {label}
      </Button>
    </HintTooltip>
  );
}

function HeaderActions(props: PreviewHeaderProps): ReactElement {
  const moveTrigger = props.offline ? (
    <DisabledAction label="Move" icon={MoveRight} />
  ) : (
    <Button variant="ghost" size="sm" prefix={<MoveRight className="size-4" aria-hidden />}>
      Move
    </Button>
  );
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={props.onOpen}
        prefix={<ArrowUpRight className="size-4" aria-hidden />}
        suffix={<ShortcutHint id="list-open" />}
      >
        Open
      </Button>
      <PlacementPicker
        world={props.world}
        subject={{ kind: 'place', locationId: props.place.id }}
        recents={[]}
        open={props.movingPlace}
        onOpenChange={props.onMovingPlaceChange}
        onPick={(target: PlacementTarget) => {
          if (target.kind === 'location') props.edits.moveTo(props.place.id, target.locationId);
          props.onMovingPlaceChange(false);
        }}
        trigger={moveTrigger}
      />
      {props.offline ? (
        <DisabledAction label="Store here" icon={PackagePlus} />
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={props.onStoreHere}
          prefix={<PackagePlus className="size-4" aria-hidden />}
        >
          Store here
        </Button>
      )}
      <PlaceMenu
        name={props.place.name}
        offline={props.offline}
        handlers={{
          onOpen: props.onOpen,
          onNewInside: () => props.edits.startCreate(props.place.id),
          onRename: () => props.edits.startRename(props.place.id),
          onMove: () => props.onMovingPlaceChange(true),
          onDelete: () => props.edits.requestDelete(props.place.id),
        }}
      />
    </div>
  );
}

/** Renders the selected place path, title, tally, and actions. */
export function PreviewHeader(props: PreviewHeaderProps): ReactElement {
  const Icon = PLACE_ICONS[props.place.kind];
  return (
    <header className="space-y-1 border-b px-4 py-3">
      <div className="flex min-h-9 items-center gap-2">
        {props.place.parentId === null ? (
          <p className="text-xs text-muted-foreground">Top-level place</p>
        ) : (
          <PlacementPath
            world={props.world}
            placement={{ kind: 'location', locationId: props.place.parentId }}
            maxSegments={3}
            className="min-w-0 text-xs"
          />
        )}
        <span className="flex-1" />
        <HeaderActions {...props} />
      </div>
      <div className="flex items-center gap-2">
        <Icon className="size-4.5 shrink-0 text-app-accent" aria-hidden />
        <h2 className="truncate text-lg font-semibold leading-tight">{props.place.name}</h2>
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {placeSummary(props.tally)}
        </p>
      </div>
    </header>
  );
}
