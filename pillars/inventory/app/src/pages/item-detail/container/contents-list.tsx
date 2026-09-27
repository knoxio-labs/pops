import { SearchX, SquarePen } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { INVENTORY_ICONS } from '../../../foundation/model/icons.js';
import { ItemList, ItemRow, RowVerb } from '../../../foundation/rows/item-row.js';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../../foundation/model/model.js';
import type { PlacementWorld } from '../../../foundation/model/placement-model.js';
import type { SelectionApi } from '../../../foundation/selection/use-selection.js';
import type { ExitKind } from './unpack-model.js';

/** Props for the direct-content list in a container workspace. */
export interface ContentsListProps {
  rows: readonly ItemRowModel[];
  world: PlacementWorld;
  name: string;
  home: string;
  query: string;
  refusal: string | null;
  selection: SelectionApi;
  pendingIds: ReadonlySet<string>;
  rejections: Readonly<Record<string, string>>;
  onClearQuery: () => void;
  onStoreHere?: () => void;
  onExit: (ids: readonly string[], how: ExitKind) => void;
  onMove?: (ids: readonly string[]) => void;
  onOpen?: (id: string) => void;
  onEdit?: (id: string) => void;
}

function EmptyContents({
  name,
  query,
  onClearQuery,
  onStoreHere,
}: Pick<ContentsListProps, 'name' | 'query' | 'onClearQuery' | 'onStoreHere'>): ReactElement {
  const filtered = query.trim().length > 0;
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={filtered ? SearchX : INVENTORY_ICONS.container}
        size="sm"
        title={filtered ? `Nothing inside matches “${query.trim()}”` : `Nothing in ${name} yet`}
        description={
          filtered
            ? 'The filter only looks at what is directly inside.'
            : 'Store things here and they will appear in this list.'
        }
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={filtered ? onClearQuery : onStoreHere}
            disabled={!filtered && onStoreHere === undefined}
          >
            {filtered ? 'Clear filter' : 'Store here'}
          </Button>
        }
      />
    </div>
  );
}

function RowVerbs({
  id,
  home,
  refusal,
  onExit,
  onMove,
  onEdit,
}: Pick<ContentsListProps, 'home' | 'refusal' | 'onExit' | 'onMove' | 'onEdit'> & { id: string }) {
  const disabledReason = refusal ?? undefined;
  return (
    <>
      <RowVerb
        icon={INVENTORY_ICONS.takeOut}
        label={`Take out to ${home}`}
        shortcutId="take-out"
        disabledReason={disabledReason}
        onClick={() => onExit([id], 'take-out')}
      />
      <RowVerb
        icon={INVENTORY_ICONS.move}
        label="Move"
        shortcutId="move"
        disabledReason={disabledReason}
        onClick={() => onMove?.([id])}
      />
      <RowVerb
        icon={INVENTORY_ICONS.pickUp}
        label="Pick up"
        shortcutId="pick-up"
        disabledReason={disabledReason}
        onClick={() => onExit([id], 'pick-up')}
      />
      <RowVerb
        icon={SquarePen}
        label="Edit"
        shortcutId="list-edit"
        disabledReason={disabledReason}
        onClick={() => onEdit?.(id)}
      />
    </>
  );
}

type ContentsRowsProps = Omit<ContentsListProps, 'query' | 'onClearQuery' | 'onStoreHere'>;

function ContentsRows({
  rows,
  world,
  name,
  home,
  refusal,
  selection,
  onExit,
  onMove,
  onOpen,
  onEdit,
  pendingIds,
  rejections,
}: ContentsRowsProps): ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-20">
      <ItemList
        label={`Inside ${name}`}
        onKeyDown={(event) => {
          if (selection.onKey(event)) event.preventDefault();
        }}
      >
        {rows.map((row) => (
          <ItemRow
            key={row.id}
            item={row}
            world={world}
            selectable
            showPlacement={false}
            selected={selection.isSelected(row.id)}
            focused={selection.state.focusedId === row.id}
            onToggle={selection.onRowToggle}
            onOpen={onOpen}
            pending={pendingIds.has(row.id)}
            rejection={rejections[row.id] ?? null}
            verbs={
              <RowVerbs
                id={row.id}
                home={home}
                refusal={refusal}
                onExit={onExit}
                onMove={onMove}
                onEdit={onEdit}
              />
            }
          />
        ))}
      </ItemList>
    </div>
  );
}

/** Renders direct contents, including filtered and genuinely empty states. */
export function ContentsList(props: ContentsListProps): ReactElement {
  if (props.rows.length === 0) {
    return (
      <EmptyContents
        name={props.name}
        query={props.query}
        onClearQuery={props.onClearQuery}
        onStoreHere={props.onStoreHere}
      />
    );
  }
  return <ContentsRows {...props} />;
}
