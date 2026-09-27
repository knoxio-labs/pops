import { FolderPlus } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { useDropTarget, TargetHint } from '../../foundation/places/drop-target.js';

import type { ReactElement } from 'react';

import type { DragPlacementApi } from '../../foundation/drag/use-drag-placement.js';
import type { LocationModel, PlacementTarget } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';

function PlaceRow({
  place,
  tally,
  onOpen,
  world,
  drag,
}: {
  place: LocationModel;
  tally: PlaceTally;
  onOpen: () => void;
  world: PlacementWorld;
  drag?: DragPlacementApi;
}): ReactElement {
  const target: PlacementTarget = { kind: 'location', locationId: place.id };
  const { setNodeRef, state } = useDropTarget(drag, target);
  const detail = [
    tally.places > 0 ? `${tally.places} ${tally.places === 1 ? 'place' : 'places'}` : null,
    tally.total > 0 ? `${tally.total} ${tally.total === 1 ? 'thing' : 'things'}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(', ');
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-11 items-center gap-3 border-b px-3 last:border-b-0',
        state === 'over' && 'bg-app-accent/10',
        state === 'refused' && 'cursor-no-drop opacity-60'
      )}
    >
      <FolderPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Button
        variant="ghost"
        size="sm"
        className="min-w-0 justify-start px-0 text-left"
        onClick={onOpen}
      >
        <span className="truncate">{place.name}</span>
      </Button>
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        <TargetHint world={world} drag={drag} target={target} />
        <span>{detail || 'Empty'}</span>
      </span>
    </div>
  );
}

/** Renders the child-place rows and their server tallies. */
export function PlaceList({
  places,
  world,
  drag,
  tallyOf,
  onOpenPlace,
}: {
  places: readonly LocationModel[];
  world: PlacementWorld;
  drag?: DragPlacementApi;
  tallyOf: (id: string) => PlaceTally;
  onOpenPlace: (id: string) => void;
}): ReactElement {
  return (
    <div role="grid" aria-label="Places inside">
      {places.map((place) => (
        <PlaceRow
          key={place.id}
          place={place}
          tally={tallyOf(place.id)}
          world={world}
          drag={drag}
          onOpen={() => onOpenPlace(place.id)}
        />
      ))}
    </div>
  );
}
