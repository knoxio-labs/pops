import { FolderPlus } from 'lucide-react';

import { Button } from '@pops/ui';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlaceTally } from '../../inventory-web/useLocationTallies.js';

function PlaceRow({
  place,
  tally,
  onOpen,
}: {
  place: LocationModel;
  tally: PlaceTally;
  onOpen: () => void;
}): ReactElement {
  const detail = [
    tally.places > 0 ? `${tally.places} ${tally.places === 1 ? 'place' : 'places'}` : null,
    tally.total > 0 ? `${tally.total} ${tally.total === 1 ? 'thing' : 'things'}` : null,
  ]
    .filter((value): value is string => value !== null)
    .join(', ');
  return (
    <div className="flex min-h-11 items-center gap-3 border-b px-3 last:border-b-0">
      <FolderPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <Button
        variant="ghost"
        size="sm"
        className="min-w-0 justify-start px-0 text-left"
        onClick={onOpen}
      >
        <span className="truncate">{place.name}</span>
      </Button>
      <span className="ml-auto text-xs text-muted-foreground">{detail || 'Empty'}</span>
    </div>
  );
}

/** Renders the child-place rows and their server tallies. */
export function PlaceList({
  places,
  tallyOf,
  onOpenPlace,
}: {
  places: readonly LocationModel[];
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
          onOpen={() => onOpenPlace(place.id)}
        />
      ))}
    </div>
  );
}
