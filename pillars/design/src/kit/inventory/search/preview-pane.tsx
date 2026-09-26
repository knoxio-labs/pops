import { catalogueTypes } from '@/fixtures/inventory-type-catalogue';
/**
 * The right half of the search page: the active result, read without
 * leaving the list. Items and containers carry their placement verbs; a
 * container lists what it holds; a place lists what is directly there.
 */
import { ExternalLink, MapPin } from 'lucide-react';

import { Button } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  INVENTORY_ICONS,
  ItemMark,
  LifecycleBadge,
  PlacementPath,
  QuantityBadge,
  ShortcutHint,
  SyncBadge,
  TypeLabel,
  directContents,
} from '../foundation';
import { typePathLabel } from '../type-tree/model';
import { PreviewFact, PreviewFrame, PreviewList, PreviewRow } from './preview-parts';

import type { ItemRowModel, LocationModel, PlacementWorld } from '../foundation';
import type { PurchaseResult } from './purchase-model';

const I = INVENTORY_ICONS;

function typeDisplay(item: ItemRowModel): string | null {
  if (item.typeId !== null) {
    const path = typePathLabel(catalogueTypes, item.typeId);
    if (path !== '') return path;
  }
  return item.typeName;
}

function ItemVerbs({ item }: { item: ItemRowModel }) {
  const inHand = item.placement.kind === 'in-hand';
  const Place = inHand ? I.putBack : I.pickUp;
  return (
    <>
      <Button size="sm" suffix={<ShortcutHint id="list-open" />}>
        Open
      </Button>
      <Button size="sm" variant="outline" prefix={<Place className="size-4" aria-hidden />}>
        {inHand ? 'Put back' : 'Pick up'}
      </Button>
      <Button size="sm" variant="outline" prefix={<I.move className="size-4" aria-hidden />}>
        Move
      </Button>
    </>
  );
}

const changed = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function ItemFacts({ item, boughtIn }: { item: ItemRowModel; boughtIn?: PurchaseResult }) {
  const typeName = typeDisplay(item);
  return (
    <dl className="divide-y divide-border/60 rounded-lg border">
      <PreviewFact label="Type">{typeName ?? 'None yet'}</PreviewFact>
      <PreviewFact label="Quantity">{item.quantity}</PreviewFact>
      <PreviewFact label="Code">{item.code ?? 'None'}</PreviewFact>
      <PreviewFact label="Bought">
        {boughtIn ? (
          <span className="flex items-center gap-2">
            {`${boughtIn.merchant}, ${changed.format(new Date(boughtIn.date))}`}
            <ExternalLink
              className="size-3.5 text-muted-foreground"
              aria-label="Opens in Purchases"
            />
          </span>
        ) : (
          <span className="text-muted-foreground">No linked purchase</span>
        )}
      </PreviewFact>
      <PreviewFact label="Changed">{changed.format(new Date(item.updatedAt))}</PreviewFact>
      {item.note ? <PreviewFact label="Note">{item.note}</PreviewFact> : null}
    </dl>
  );
}

/** Preview of an item or container. */
export function ItemPreview({
  item,
  world,
  boughtIn,
}: {
  item: ItemRowModel;
  world: PlacementWorld;
  boughtIn?: PurchaseResult;
}) {
  const contents = item.container === null ? [] : directContents(world, item.id);
  const typeName = typeDisplay(item);
  return (
    <PreviewFrame
      mark={<ItemMark item={item} size="md" />}
      title={item.name}
      badges={
        <>
          <TypeLabel typeName={typeName} />
          <QuantityBadge quantity={item.quantity} />
          <ContainerStateBadge container={item.container} />
          <LifecycleBadge lifecycle={item.lifecycle} />
          <SyncBadge sync={item.sync} />
          <CodeBadge code={item.code} />
        </>
      }
      where={<PlacementPath world={world} placement={item.placement} maxSegments={5} />}
      actions={<ItemVerbs item={item} />}
    >
      {item.container === null ? (
        <ItemFacts item={item} boughtIn={boughtIn} />
      ) : (
        <PreviewList
          title="Inside"
          count={contents.length}
          empty="Empty. Store here from the container page."
        >
          {contents.map((inside) => (
            <PreviewRow key={inside.id} item={inside} />
          ))}
        </PreviewList>
      )}
    </PreviewFrame>
  );
}

/** Preview of a place. */
export function PlacePreview({
  place,
  path,
  world,
}: {
  place: LocationModel;
  path: string;
  world: PlacementWorld;
}) {
  const here = [...world.items.values()].filter(
    (item) => item.placement.kind === 'location' && item.placement.locationId === place.id
  );
  return (
    <PreviewFrame
      mark={
        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <MapPin className="size-5" aria-hidden />
        </span>
      }
      title={place.name}
      where={
        <span className="text-xs text-muted-foreground">{path === '' ? 'Top level' : path}</span>
      }
      actions={
        <>
          <Button size="sm" suffix={<ShortcutHint id="list-open" />}>
            Open place
          </Button>
          <Button size="sm" variant="outline">
            Store here
          </Button>
        </>
      }
    >
      <PreviewList title="Directly here" count={here.length} empty="Nothing is directly here.">
        {here.map((item) => (
          <PreviewRow key={item.id} item={item} />
        ))}
      </PreviewList>
    </PreviewFrame>
  );
}
