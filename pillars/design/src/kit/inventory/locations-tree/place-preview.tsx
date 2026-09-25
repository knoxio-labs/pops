/**
 * The selected place, beside the tree: where it is, what it holds in one
 * line, its verbs, and its contents as one scrolling list (directly here,
 * then inside each box). Rows drag onto the tree to move them.
 */
import { ArrowUpRight, PackagePlus } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { PlacementPath, ShortcutHint, useSelection } from '../foundation';
import { ContentsSelectionBar } from '../location-page/contents-bar';
import { BoxedList, HereList } from '../location-page/contents-lists';
import { placeContents } from '../location-page/contents-model';
import { PLACE_ICONS } from './fit-page';
import { PlaceMenu } from './place-menu';
import { placeSummary } from './place-summary';
import { tallyPlace } from './tree-model';

import type { ReactNode } from 'react';

import type { LocationModel, SelectionState } from '../foundation';
import type { PlaceContents } from '../location-page/contents-model';
import type { RowContext } from '../location-page/contents-rows';
import type { ItemActionsApi } from '../location-page/use-item-actions';
import type { PlaceMenuHandlers } from './place-menu';
import type { LocationsApi } from './use-locations';

/** Props for {@link PlacePreview}. */
export interface PlacePreviewProps {
  api: LocationsApi;
  place: LocationModel;
  verbs: ItemActionsApi;
  initialSelection?: SelectionState;
  /** The Move button, which the placement picker anchors to. */
  moveControl: ReactNode;
  menu: PlaceMenuHandlers;
  onOpen: () => void;
  onStoreHere: () => void;
  onOpenItem?: (id: string) => void;
}

function SectionTitle({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="flex items-baseline gap-2 px-1 text-2xs font-semibold uppercase tracking-label text-muted-foreground">
      {label}
      <span className="tabular-nums">{count}</span>
    </h3>
  );
}

function Header({ api, place, moveControl, menu, onOpen, onStoreHere }: PlacePreviewProps) {
  const Icon = PLACE_ICONS[place.kind];
  return (
    <header className="space-y-1 border-b px-4 py-3">
      <div className="flex min-h-9 items-center gap-2">
        {place.parentId === null ? (
          <p className="text-xs text-muted-foreground">Top-level place</p>
        ) : (
          <PlacementPath
            world={api.world}
            placement={{ kind: 'location', locationId: place.parentId }}
            maxSegments={3}
            className="min-w-0 text-xs"
          />
        )}
        <span className="flex-1" />
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onOpen}
            prefix={<ArrowUpRight className="size-4" aria-hidden />}
            suffix={<ShortcutHint id="list-open" />}
          >
            Open
          </Button>
          {moveControl}
          <Button
            size="sm"
            variant="outline"
            onClick={onStoreHere}
            prefix={<PackagePlus className="size-4" aria-hidden />}
          >
            Store here
          </Button>
          <PlaceMenu name={place.name} handlers={menu} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Icon className="size-4.5 shrink-0 text-app-accent" aria-hidden />
        <h2 className="truncate text-lg font-semibold leading-tight">{place.name}</h2>
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {placeSummary(tallyPlace(api.world, place.id))}
        </p>
      </div>
    </header>
  );
}

function PreviewLists({
  place,
  contents,
  ctx,
  onStoreHere,
}: {
  place: LocationModel;
  contents: PlaceContents;
  ctx: RowContext;
  onStoreHere: () => void;
}) {
  if (contents.here.length === 0) {
    return (
      <EmptyState
        icon={PackagePlus}
        size="sm"
        title={`Nothing is in ${place.name}`}
        description={
          contents.places.length > 0
            ? 'The places inside it may hold things. Open them in the tree.'
            : 'Store things here to find them later.'
        }
        action={
          <Button size="sm" onClick={onStoreHere}>
            Store here
          </Button>
        }
      />
    );
  }
  return (
    <>
      <SectionTitle label="Directly here" count={contents.here.length} />
      <HereList items={contents.here} ctx={ctx} />
      {contents.boxes.length > 0 ? (
        <>
          <SectionTitle label="In boxes here" count={contents.boxedCount} />
          <BoxedList groups={contents.boxes} ctx={ctx} />
        </>
      ) : null}
    </>
  );
}

/** The panel. */
export function PlacePreview(props: PlacePreviewProps) {
  const { api, place } = props;
  const contents = placeContents(api.world, place.id);
  const order = [...contents.here, ...contents.boxes.flatMap((group) => group.contents)].map(
    (entry) => entry.id
  );
  const selection = useSelection(order, props.initialSelection);
  const ctx: RowContext = {
    world: api.world,
    selection,
    drag: api.itemDrag,
    onOpenItem: props.onOpenItem,
    onPickUp: (id) => props.verbs.pickUp([id]),
    onMove: (id) => props.verbs.startMove([id]),
    onTakeOut: (id) => props.verbs.takeOut([id]),
  };
  return (
    <>
      <section
        aria-label={place.name}
        className="hidden min-h-0 flex-col rounded-xl border bg-card lg:flex"
      >
        <Header {...props} />
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
          <PreviewLists
            place={place}
            contents={contents}
            ctx={ctx}
            onStoreHere={props.onStoreHere}
          />
        </div>
      </section>
      {selection.count > 0 ? (
        <div className="hidden lg:col-span-2 lg:block">
          <ContentsSelectionBar
            world={api.world}
            selection={selection}
            loadedCount={order.length}
            verbs={props.verbs}
          />
        </div>
      ) : null}
    </>
  );
}
