/**
 * The page a Store here sheet opens from, drawn behind it for review: the
 * target's own header and what is directly in it, with the sheet docked on
 * the right the way it opens over the container workspace or location page.
 */
import { Button, PageHeader } from '@pops/ui';

import { INVENTORY_ICONS } from '../shared/icons';
import { ItemList, ItemRow } from '../shared/item-row';
import { StoreHereSheetPanel } from './store-here-sheet';

import type { StoreHereTarget } from '../shared/contracts';
import type { ItemRowModel } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';
import type { StoreHereOpening } from './store-here-sheet';

function directlyIn(world: PlacementWorld, target: StoreHereTarget): ItemRowModel[] {
  return [...world.items.values()].filter((item) =>
    target.kind === 'container'
      ? item.placement.kind === 'container' && item.placement.containerId === target.id
      : item.placement.kind === 'location' && item.placement.locationId === target.id
  );
}

/** Props for {@link StoreHereStage}. */
export interface StoreHereStageProps {
  target: StoreHereTarget;
  world: PlacementWorld;
  tab: 'new' | 'existing';
  opening: StoreHereOpening;
}

/** The review stage: page behind, sheet in front. */
export function StoreHereStage({ target, world, tab, opening }: StoreHereStageProps) {
  const Icon = target.kind === 'container' ? INVENTORY_ICONS.container : INVENTORY_ICONS.location;
  const contents = directlyIn(world, target);
  return (
    <div className="flex h-[calc(100vh-8rem)] gap-6">
      <div aria-hidden className="hidden min-w-0 flex-1 flex-col gap-4 opacity-45 lg:flex">
        <PageHeader
          title={target.name}
          description={`${contents.length} items directly in it`}
          icon={
            <span className="flex size-9 items-center justify-center rounded-lg bg-app-accent/15">
              <Icon className="size-5 text-app-accent" aria-hidden />
            </span>
          }
          actions={<Button size="sm">Store here</Button>}
        />
        <ItemList label={`In ${target.name}`}>
          {contents.map((item) => (
            <ItemRow key={item.id} item={item} world={world} showPlacement={false} />
          ))}
        </ItemList>
      </div>
      <StoreHereSheetPanel
        target={target}
        world={world}
        initialTab={tab}
        opening={opening}
        className="w-full shrink-0 rounded-xl lg:w-120"
      />
    </div>
  );
}
