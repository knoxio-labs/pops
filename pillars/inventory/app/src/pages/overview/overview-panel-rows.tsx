import { CodeBadge, SyncBadge } from '../../foundation/badges/badges.js';
import { ItemMark } from '../../foundation/badges/item-mark.js';
import { PlaceName } from '../../foundation/badges/place-name.js';
import { returnRoute } from '../../foundation/in-hand/in-hand-model.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { RowVerb } from '../../foundation/rows/item-row.js';
import { PanelRow } from './panel.js';

import type { ReactElement, ReactNode } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PanelContext } from './overview-panels.js';

function savedDetail(detail: ReactNode, rejection: string | undefined): ReactNode {
  if (rejection === undefined) return detail;
  return (
    <span className="text-foreground">
      <span className="font-medium">Not saved.</span> {rejection}
    </span>
  );
}

function directContentLabel(
  itemId: string,
  contentCounts: Readonly<Record<string, { direct: number; deep: number }>>
): string {
  const directCount = contentCounts[itemId]?.direct ?? 0;
  return directCount === 0 ? 'Empty' : `${directCount} inside`;
}

/** Renders one open-container row and its Close verb. */
export function OpenContainerRow({
  item,
  contentCounts,
  rejections,
  pendingIds,
  ctx,
  onClose,
}: {
  item: ItemRowModel;
  contentCounts: Readonly<Record<string, { direct: number; deep: number }>>;
  rejections: Readonly<Record<string, string>>;
  pendingIds: ReadonlySet<string>;
  ctx: PanelContext;
  onClose: (item: ItemRowModel) => void;
}): ReactElement {
  return (
    <PanelRow
      mark={<ItemMark item={item} />}
      title={
        <>
          <span className="truncate font-medium">{item.name}</span>
          <CodeBadge code={item.code} />
          {pendingIds.has(item.id) ? <SyncBadge sync="sending" /> : null}
        </>
      }
      detail={savedDetail(
        <>
          <PlaceName world={ctx.world} target={item.placement} />
          <span className="shrink-0">· {directContentLabel(item.id, contentCounts)}</span>
        </>,
        rejections[item.id]
      )}
      verbs={
        <RowVerb
          icon={INVENTORY_ICONS.closed}
          label={`Close ${item.name}`}
          disabledReason={ctx.disabledReason}
          onClick={() => onClose(item)}
        />
      }
    />
  );
}

function inHandDetail(item: ItemRowModel, world: PanelContext['world']): ReactNode {
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

function putBackDisabledReason(item: ItemRowModel, disabledReason: string | undefined) {
  if (disabledReason !== undefined) return disabledReason;
  return returnRoute(item).kind === 'back' ? undefined : 'No place to go back to. Use Move';
}

/** Renders one in-hand row with Put back and Move verbs. */
export function InHandRow({
  item,
  rejections,
  pendingIds,
  ctx,
  onPutBack,
  onMove,
}: {
  item: ItemRowModel;
  rejections: Readonly<Record<string, string>>;
  pendingIds: ReadonlySet<string>;
  ctx: PanelContext;
  onPutBack: (item: ItemRowModel) => void;
  onMove: (item: ItemRowModel) => void;
}): ReactElement {
  return (
    <PanelRow
      mark={<ItemMark item={item} />}
      title={
        <>
          <span className="truncate font-medium">{item.name}</span>
          {pendingIds.has(item.id) ? <SyncBadge sync="sending" /> : null}
        </>
      }
      detail={savedDetail(inHandDetail(item, ctx.world), rejections[item.id])}
      verbs={
        <>
          <RowVerb
            icon={INVENTORY_ICONS.putBack}
            label={`Put back ${item.name}`}
            shortcutId="put-back"
            disabledReason={putBackDisabledReason(item, ctx.disabledReason)}
            onClick={() => onPutBack(item)}
          />
          <RowVerb
            icon={INVENTORY_ICONS.move}
            label={`Move ${item.name}`}
            shortcutId="move"
            disabledReason={ctx.disabledReason}
            onClick={() => onMove(item)}
          />
        </>
      }
    />
  );
}
