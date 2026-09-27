import { useDraggable, useDroppable } from '@dnd-kit/core';

import { cn } from '@pops/ui';

import { DROP_TARGET_CLASS } from '../../foundation/drag/drag-dock.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { ItemRow, RowVerb } from '../../foundation/rows/item-row.js';

import type { ReactElement } from 'react';

import type { DragPlacementApi } from '../../foundation/drag/use-drag-placement.js';
import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { BoxGroup, ContentsVerbs } from './location-tab-content-model.js';

function ContentRowVerbs({
  itemId,
  inBox,
  verbs,
}: {
  itemId: string;
  inBox: boolean;
  verbs: ContentsVerbs;
}): ReactElement {
  return (
    <>
      {inBox ? (
        <RowVerb
          icon={INVENTORY_ICONS.takeOut}
          label="Take out"
          shortcutId="take-out"
          disabledReason={verbs.disabledReason}
          onClick={() => verbs.takeOut([itemId])}
        />
      ) : null}
      <RowVerb
        icon={INVENTORY_ICONS.pickUp}
        label="Pick up"
        shortcutId="pick-up"
        disabledReason={verbs.disabledReason}
        onClick={() => verbs.pickUp([itemId])}
      />
      <RowVerb
        icon={INVENTORY_ICONS.move}
        label="Move"
        shortcutId="move"
        disabledReason={verbs.disabledReason}
        onClick={() => verbs.startMove([itemId])}
      />
    </>
  );
}

/** Renders one selectable item row and its location verbs. */
export function ContentRow({
  item,
  world,
  selection,
  ids,
  verbs,
  onOpen,
  inBox,
}: {
  item: ItemRowModel;
  world: PlacementWorld;
  selection: SelectionApi;
  ids: readonly string[];
  verbs: ContentsVerbs;
  onOpen: (id: string, ids: readonly string[]) => void;
  inBox: boolean;
}): ReactElement {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: `item:${item.id}`,
    data: { kind: 'item', id: item.id, selectedIds: selection.selectedIds },
    disabled: verbs.drag === undefined || verbs.disabledReason !== undefined,
  });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn(isDragging && 'opacity-50')}>
      <ItemRow
        item={item}
        world={world}
        selectable
        selected={selection.isSelected(item.id)}
        focused={selection.state.focusedId === item.id}
        pending={verbs.pendingIds.has(item.id)}
        rejection={verbs.rejections[item.id]}
        showPlacement={false}
        onToggle={selection.onRowToggle}
        onOpen={(id) => onOpen(id, ids)}
        verbs={<ContentRowVerbs itemId={item.id} inBox={inBox} verbs={verbs} />}
      />
    </div>
  );
}

/** Renders the box heading above its direct contents. */
export function BoxHeader({
  group,
  drag,
}: {
  group: BoxGroup;
  drag?: DragPlacementApi;
}): ReactElement {
  const target = { kind: 'container' as const, containerId: group.box.id };
  const { setNodeRef } = useDroppable({
    id: `container:${group.box.id}`,
    data: { kind: 'target', target },
  });
  const state = drag?.stateFor(target) ?? 'idle';
  return (
    <div
      ref={setNodeRef}
      role="row"
      className={cn(
        'flex h-10 items-center gap-2 bg-muted/50 pr-3',
        group.depth > 0 ? 'pl-9' : 'pl-3',
        DROP_TARGET_CLASS[state]
      )}
    >
      <span className="font-medium">{group.box.name}</span>
      <span className="text-xs text-muted-foreground">
        {group.contents.length} {group.contents.length === 1 ? 'thing' : 'things'}
      </span>
    </div>
  );
}

/** Renders the item rows inside one box group. */
export function ItemContents({
  contents,
  world,
  selection,
  verbs,
  ids,
  onOpen,
}: {
  contents: readonly ItemRowModel[];
  world: PlacementWorld;
  selection: SelectionApi;
  verbs: ContentsVerbs;
  ids: readonly string[];
  onOpen: (id: string, ids: readonly string[]) => void;
}): ReactElement {
  return (
    <>
      {contents.map((item) => (
        <ContentRow
          key={item.id}
          item={item}
          world={world}
          selection={selection}
          ids={ids}
          verbs={verbs}
          onOpen={onOpen}
          inBox
        />
      ))}
    </>
  );
}
