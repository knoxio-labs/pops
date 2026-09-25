import { returnRoute } from '../in-hand/in-hand-model';
import { CodeBadge } from '../shared/badges';
import { INVENTORY_ICONS } from '../shared/icons';
/**
 * The Overview's three work panels: open containers (Close), what is in
 * hand (Put back, Move) and recent work (Undo). Each shows what it has and
 * links to the page with the rest.
 */
import { ItemMark } from '../shared/item-mark';
import { RowVerb } from '../shared/item-row';
import { OverviewPanel, PanelEmpty, PanelRow } from './panel';
import { PlaceName } from './place-name';

import type { ItemRowModel } from '../shared/model';
import type { PlacementWorld } from '../shared/placement-model';
import type { OpenContainerRow } from './overview-model';

const I = INVENTORY_ICONS;

/** What every panel verb needs: the world to name places, and why verbs are off. */
export interface PanelContext {
  world: PlacementWorld;
  /** Set when mutations are unavailable (offline); every verb shows it. */
  disabledReason?: string;
  onNavigate?: (path: string) => void;
}

/** Open containers, each with Close. */
export function OpenContainersPanel({
  rows,
  ctx,
}: {
  rows: readonly OpenContainerRow[];
  ctx: PanelContext;
}) {
  return (
    <OverviewPanel
      title="Open containers"
      icon={I.open}
      count={rows.length}
      linkLabel="Containers"
      onLink={() => ctx.onNavigate?.('/inventory/containers?state=open')}
      empty={rows.length === 0 ? <PanelEmpty>Every container is closed.</PanelEmpty> : undefined}
    >
      {rows.map(({ container, directCount }) => (
        <PanelRow
          key={container.id}
          mark={<ItemMark item={container} />}
          title={
            <>
              <span className="truncate font-medium">{container.name}</span>
              <CodeBadge code={container.code} />
            </>
          }
          detail={
            <>
              <PlaceName world={ctx.world} target={container.placement} />
              <span className="shrink-0">
                · {directCount === 0 ? 'Empty' : `${directCount} inside`}
              </span>
            </>
          }
          verbs={
            <RowVerb
              icon={I.closed}
              label={`Close ${container.name}`}
              disabledReason={ctx.disabledReason}
            />
          }
        />
      ))}
    </OverviewPanel>
  );
}

function InHandDetail({ item, world }: { item: ItemRowModel; world: PlacementWorld }) {
  const route = returnRoute(item);
  if (route.kind === 'back') {
    return (
      <>
        <span className="shrink-0">From</span>
        <PlaceName world={world} target={route.to} />
      </>
    );
  }
  if (route.kind === 'deleted') return <span className="truncate">{route.name} was deleted</span>;
  return <span className="truncate">No previous place</span>;
}

function putBackReason(item: ItemRowModel, offline: string | undefined): string | undefined {
  if (offline !== undefined) return offline;
  return returnRoute(item).kind === 'back' ? undefined : 'No place to go back to. Use Move';
}

/** The first five things in hand, each with Put back and Move. */
export function InHandPanel({ items, ctx }: { items: readonly ItemRowModel[]; ctx: PanelContext }) {
  return (
    <OverviewPanel
      title="In hand"
      icon={I.inHand}
      count={items.length}
      linkLabel="In hand"
      onLink={() => ctx.onNavigate?.('/inventory/in-hand')}
      empty={items.length === 0 ? <PanelEmpty>Nothing is in hand.</PanelEmpty> : undefined}
    >
      {items.slice(0, 5).map((item) => (
        <PanelRow
          key={item.id}
          mark={<ItemMark item={item} />}
          title={<span className="truncate font-medium">{item.name}</span>}
          detail={<InHandDetail item={item} world={ctx.world} />}
          verbs={
            <>
              <RowVerb
                icon={I.putBack}
                label={`Put back ${item.name}`}
                shortcutId="put-back"
                disabledReason={putBackReason(item, ctx.disabledReason)}
              />
              <RowVerb
                icon={I.move}
                label={`Move ${item.name}`}
                shortcutId="move"
                disabledReason={ctx.disabledReason}
              />
            </>
          }
        />
      ))}
    </OverviewPanel>
  );
}
