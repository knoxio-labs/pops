import {
  HintTooltip,
  ItemList,
  ItemRow,
  RowVerb,
  SelectionBar,
  locationPath,
} from '@/kit/inventory/foundation';
import { EmptyBody, ScrollPanel, SkeletonRows } from '@/kit/inventory/secondary-page';
/**
 * The fixture page's pieces: the facts column, the wired item rows with
 * their bulk bar, the Wire items button and the loading body.
 */
import { Pencil, Plug, Plus, Unlink } from 'lucide-react';

import { Button, Skeleton } from '@pops/ui';

import type { ItemRowModel, PlacementWorld, SelectionApi } from '@/kit/inventory/foundation';
import type { ReactNode } from 'react';

import type { FixtureModel } from './fixture-model';

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-2xs font-medium tracking-label text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** The fixture's facts column. */
export function Facts({
  fixture,
  world,
  onEdit,
}: {
  fixture: FixtureModel;
  world: PlacementWorld;
  onEdit: () => void;
}) {
  const path = locationPath(world, fixture.locationId).map((node) => node.name);
  return (
    <aside
      aria-label="Fixture"
      className="flex w-full shrink-0 flex-col gap-4 self-start rounded-lg border bg-card p-4 lg:w-72"
    >
      <dl className="grid gap-3">
        <Fact label="Built into">{path.join(' / ')}</Fact>
        <Fact label="Note">
          {fixture.note ?? <span className="text-muted-foreground">None</span>}
        </Fact>
        <Fact label="Recorded">
          {new Date(fixture.addedAt).toLocaleDateString('en-AU', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </Fact>
      </dl>
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        prefix={<Pencil className="size-4" aria-hidden />}
        onClick={onEdit}
      >
        Edit fixture
      </Button>
    </aside>
  );
}

function WiredList(props: {
  items: readonly ItemRowModel[];
  world: PlacementWorld;
  selection: SelectionApi;
  lockedReason?: string;
  onDisconnect: (ids: readonly string[]) => void;
  onWire: () => void;
  onOpen?: (id: string) => void;
}) {
  if (props.items.length === 0) {
    return (
      <ScrollPanel>
        <EmptyBody
          icon={Plug}
          title="Nothing is wired to this fixture"
          description="Wire the lamp, charger or router that uses it, so tracing that item ends here."
          action={<Button onClick={props.onWire}>Wire items</Button>}
        />
      </ScrollPanel>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ItemList label="Wired items">
        {props.items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            world={props.world}
            selectable
            selected={props.selection.isSelected(item.id)}
            onToggle={props.selection.onRowToggle}
            onOpen={props.onOpen}
            verbs={
              <RowVerb
                icon={Unlink}
                label={`Disconnect ${item.name}`}
                disabledReason={props.lockedReason}
                onClick={() => props.onDisconnect([item.id])}
              />
            }
          />
        ))}
      </ItemList>
    </div>
  );
}

/** Wire items, off with its reason while offline. */
export function WireButton({
  lockedReason,
  onClick,
}: {
  lockedReason?: string;
  onClick: () => void;
}) {
  const locked = lockedReason !== undefined;
  return (
    <HintTooltip label="Wire items to this fixture" disabledReason={lockedReason}>
      <Button
        aria-disabled={locked || undefined}
        className={locked ? 'opacity-50' : undefined}
        prefix={<Plus className="size-4" aria-hidden />}
        onClick={locked ? undefined : onClick}
      >
        Wire items
      </Button>
    </HintTooltip>
  );
}

/** The page while the fixture and its items load. */
export function LoadingBody() {
  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <Skeleton className="h-56 w-72 rounded-lg" />
      <ScrollPanel>
        <SkeletonRows rows={4} />
      </ScrollPanel>
    </div>
  );
}

/** The wired items: heading, rows and the bulk bar. */
export function WiredSection(props: {
  items: readonly ItemRowModel[];
  world: PlacementWorld;
  selection: SelectionApi;
  lockedReason?: string;
  onDisconnect: (ids: readonly string[]) => void;
  onWire: () => void;
  onOpen?: (id: string) => void;
}) {
  const { selection } = props;
  return (
    <section aria-label="Wired items" className="flex min-w-0 flex-1 flex-col gap-2">
      <h2 className="text-sm font-medium">Wired to this fixture: {props.items.length}</h2>
      <WiredList {...props} />
      <SelectionBar
        count={selection.count}
        loadedCount={props.items.length}
        coverage={selection.coverage}
        onSelectAll={selection.onHeaderToggle}
        onClear={selection.clearSelection}
        actions={[
          {
            id: 'disconnect',
            label: `Disconnect ${selection.count}`,
            icon: Unlink,
            disabledReason: props.lockedReason,
            onSelect: () => props.onDisconnect(selection.selectedIds),
          },
        ]}
      />
    </section>
  );
}
