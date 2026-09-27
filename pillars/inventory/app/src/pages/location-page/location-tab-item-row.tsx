import { cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { ItemRow, RowVerb } from '../../foundation/rows/item-row.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../foundation/selection/use-selection.js';
import type { BoxGroup, ContentsVerbs } from './location-tab-content-model.js';

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
  return (
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
      verbs={
        <>
          {inBox ? (
            <RowVerb
              icon={INVENTORY_ICONS.takeOut}
              label="Take out"
              shortcutId="take-out"
              disabledReason={verbs.disabledReason}
              onClick={() => verbs.takeOut([item.id])}
            />
          ) : null}
          <RowVerb
            icon={INVENTORY_ICONS.pickUp}
            label="Pick up"
            shortcutId="pick-up"
            disabledReason={verbs.disabledReason}
            onClick={() => verbs.pickUp([item.id])}
          />
          <RowVerb
            icon={INVENTORY_ICONS.move}
            label="Move"
            shortcutId="move"
            disabledReason={verbs.disabledReason}
            onClick={() => verbs.startMove([item.id])}
          />
        </>
      }
    />
  );
}

/** Renders the box heading above its direct contents. */
export function BoxHeader({ group }: { group: BoxGroup }): ReactElement {
  return (
    <div
      role="row"
      className={cn(
        'flex h-10 items-center gap-2 bg-muted/50 pr-3',
        group.depth > 0 ? 'pl-9' : 'pl-3'
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
