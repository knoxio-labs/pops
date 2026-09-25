import { InventoryPage, OFFLINE_REASON, UndoToast, useSelection } from '@/kit/inventory/foundation';
import { PageStateBanner } from '@/kit/inventory/secondary-page';
/**
 * `/inventory/fixtures/:id`: one fixture. Its facts sit in a narrow column
 * (kind, room, note, when it was recorded); the items wired to it fill the
 * rest as the shared item rows, selectable for bulk disconnect. The item
 * rows come from `GET /fixtures/:id/items` (POPS-42), which this page assumes.
 */
import { useState } from 'react';

import { Facts, LoadingBody, WireButton, WiredSection } from './fixture-detail-parts';
import { FixtureFormDialog } from './fixture-form-dialog';
import { FIXTURE_KINDS } from './fixture-kinds';
import { WireItemsSheet } from './wire-items-sheet';

import type { ItemRowModel, PlacementWorld } from '@/kit/inventory/foundation';
import type { PageBanner } from '@/kit/inventory/secondary-page';

import type { FixtureModel } from './fixture-model';

/** Props for {@link FixtureDetailPage}. */
export interface FixtureDetailPageProps {
  fixture: FixtureModel;
  world: PlacementWorld;
  wired: readonly ItemRowModel[];
  status?: 'ready' | 'loading';
  banner?: PageBanner;
  /** Opens the wire sheet with a query typed and items ticked, for review. */
  wireSeed?: { query: string; picked: readonly string[] };
  editOpen?: boolean;
  selected?: readonly string[];
  disconnected?: readonly string[];
  onNavigate?: (to: string) => void;
}

function undoMessage(removed: readonly string[], props: FixtureDetailPageProps): string {
  if (removed.length !== 1)
    return `Disconnected ${removed.length} items from ${props.fixture.name}`;
  const name = props.wired.find((item) => item.id === removed[0])?.name ?? 'item';
  return `Disconnected ${name} from ${props.fixture.name}`;
}

function useWired(props: FixtureDetailPageProps) {
  const [removed, setRemoved] = useState<readonly string[]>(props.disconnected ?? []);
  const items = props.wired.filter((item) => !removed.includes(item.id));
  const selection = useSelection(
    items.map((item) => item.id),
    { selected: new Set(props.selected ?? []), anchorId: null, focusedId: null }
  );
  const disconnect = (ids: readonly string[]) => {
    setRemoved((current) => [...current, ...ids]);
    selection.clearSelection();
  };
  return { removed, items, selection, disconnect, undo: () => setRemoved([]) };
}

function trail(name: string) {
  return [
    { label: 'Connections', href: '#connections' },
    { label: 'Fixtures', href: '#fixtures' },
    { label: name },
  ];
}

/** The fixture page. */
export function FixtureDetailPage(props: FixtureDetailPageProps) {
  const [wireOpen, setWireOpen] = useState(props.wireSeed !== undefined);
  const [editOpen, setEditOpen] = useState(props.editOpen ?? false);
  const wired = useWired(props);
  const lockedReason = props.banner === 'offline' ? OFFLINE_REASON : undefined;
  const kind = FIXTURE_KINDS[props.fixture.kind];
  return (
    <InventoryPage
      icon={kind.icon}
      title={props.fixture.name}
      description={`${kind.label} in ${props.world.locations.get(props.fixture.locationId)?.name ?? 'an unknown place'}`}
      breadcrumbs={trail(props.fixture.name)}
      actions={<WireButton lockedReason={lockedReason} onClick={() => setWireOpen(true)} />}
      banner={<PageStateBanner banner={props.banner} what="This fixture" />}
    >
      {props.status === 'loading' ? (
        <LoadingBody />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <Facts fixture={props.fixture} world={props.world} onEdit={() => setEditOpen(true)} />
          <WiredSection
            items={wired.items}
            world={props.world}
            selection={wired.selection}
            lockedReason={lockedReason}
            onDisconnect={wired.disconnect}
            onWire={() => setWireOpen(true)}
            onOpen={(id) => props.onNavigate?.(`item:${id}`)}
          />
        </div>
      )}
      <WireItemsSheet
        open={wireOpen}
        onOpenChange={setWireOpen}
        fixture={props.fixture}
        world={props.world}
        wired={wired.items}
        initialQuery={props.wireSeed?.query}
        initialPicked={props.wireSeed?.picked}
      />
      <FixtureFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        world={props.world}
        fixture={props.fixture}
      />
      {wired.removed.length > 0 ? (
        <UndoToast
          concept="connection"
          message={undoMessage(wired.removed, props)}
          onUndo={wired.undo}
          className="fixed right-6 bottom-6 z-50"
        />
      ) : null}
    </InventoryPage>
  );
}
