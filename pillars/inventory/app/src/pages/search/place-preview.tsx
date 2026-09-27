import { ArrowUpRight, MapPin } from 'lucide-react';

import { Button as UiButton } from '@pops/ui';

import { QuantityBadge } from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PreviewActions, PreviewFrame, PreviewList } from './preview-parts.js';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** Props for a place preview. */
export interface PlacePreviewProps {
  readonly place: { readonly id: string; readonly name: string };
  readonly world: PlacementWorld;
  readonly onOpen: () => void;
  readonly onStoreHere: () => void;
}

function directLocationContents(world: PlacementWorld, locationId: string): ItemRowModel[] {
  return [...world.items.values()]
    .filter(
      (item) => item.placement.kind === 'location' && item.placement.locationId === locationId
    )
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

/** Renders a place preview with its direct inventory contents. */
export function PlacePreview({ place, world, onOpen, onStoreHere }: PlacePreviewProps) {
  const contents = directLocationContents(world, place.id);
  return (
    <PreviewFrame
      title={
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <MapPin className="size-5" aria-hidden />
          </span>
          <span className="truncate">{place.name}</span>
        </span>
      }
      subtitle="Inventory place"
    >
      <PreviewActions>
        <UiButton
          size="sm"
          onClick={onOpen}
          prefix={<ArrowUpRight className="size-4" aria-hidden />}
        >
          Open place
        </UiButton>
        <UiButton size="sm" variant="outline" onClick={onStoreHere}>
          Store here
        </UiButton>
      </PreviewActions>
      <PreviewList title={`Direct contents · ${contents.length}`}>
        {contents.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Nothing is directly in this place.
          </p>
        ) : (
          contents.map((item) => (
            <div key={item.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <ItemMark item={item} size="sm" />
              <span className="truncate">{item.name}</span>
              <QuantityBadge quantity={item.quantity} />
            </div>
          ))
        )}
      </PreviewList>
    </PreviewFrame>
  );
}
