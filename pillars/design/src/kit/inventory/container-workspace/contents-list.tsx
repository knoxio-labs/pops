/**
 * The rows directly inside a container, each with Take out, Move and Pick
 * up, driven by the list keys; or, when there are none, what that means and
 * the one action that changes it.
 */
import { SearchX } from 'lucide-react';

import { Button, EmptyState } from '@pops/ui';

import { INVENTORY_ICONS, ItemList, ItemRow, RowVerb } from '../foundation';

import type { ItemRowModel, SelectionApi } from '../foundation';
import type { ItemDetailModel } from '../item-detail/detail-model';
import type { ExitKind } from './unpack-model';

const I = INVENTORY_ICONS;

/** Props for {@link ContentsList}. */
export interface ContentsListProps {
  rows: ItemRowModel[];
  model: ItemDetailModel;
  selection: SelectionApi;
  query: string;
  refusal: string | null;
  home: string;
  onClearQuery: () => void;
  onStoreHere?: () => void;
  onExit: (ids: readonly string[], how: ExitKind) => void;
  onMove?: (ids: readonly string[]) => void;
}

function Empty({
  name,
  query,
  onClearQuery,
  onStoreHere,
}: {
  name: string;
  query: string;
  onClearQuery: () => void;
  onStoreHere?: () => void;
}) {
  const filtered = query.trim() !== '';
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState
        icon={filtered ? SearchX : I.container}
        size="sm"
        title={filtered ? `Nothing inside matches “${query.trim()}”` : `Nothing in ${name} yet`}
        description={
          filtered
            ? 'The search only looks at what is directly inside.'
            : 'Store things here and they show up in this list.'
        }
        action={
          <Button size="sm" variant="outline" onClick={filtered ? onClearQuery : onStoreHere}>
            {filtered ? 'Clear search' : 'Store here'}
          </Button>
        }
      />
    </div>
  );
}

function RowVerbs({ id, props }: { id: string; props: ContentsListProps }) {
  const reason = props.refusal ?? undefined;
  return (
    <>
      <RowVerb
        icon={I.takeOut}
        label={`Take out to ${props.home}`}
        shortcutId="take-out"
        disabledReason={reason}
        onClick={() => props.onExit([id], 'take-out')}
      />
      <RowVerb
        icon={I.move}
        label="Move"
        shortcutId="move"
        disabledReason={reason}
        onClick={() => props.onMove?.([id])}
      />
      <RowVerb
        icon={I.pickUp}
        label="Pick up"
        shortcutId="pick-up"
        disabledReason={reason}
        onClick={() => props.onExit([id], 'pick-up')}
      />
    </>
  );
}

/** The rows directly inside, or the empty and filtered-empty states. */
export function ContentsList(props: ContentsListProps) {
  const { rows, model, selection } = props;
  if (rows.length === 0) {
    return (
      <Empty
        name={model.item.name}
        query={props.query}
        onClearQuery={props.onClearQuery}
        onStoreHere={props.onStoreHere}
      />
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 pb-20">
      <ItemList
        label={`Inside ${model.item.name}`}
        onKeyDown={(event) => {
          if (selection.onKey(event)) event.preventDefault();
        }}
      >
        {rows.map((row) => (
          <ItemRow
            key={row.id}
            item={row}
            world={model.world}
            selectable
            showPlacement={false}
            selected={selection.isSelected(row.id)}
            focused={selection.state.focusedId === row.id}
            onToggle={selection.onRowToggle}
            verbs={<RowVerbs id={row.id} props={props} />}
          />
        ))}
      </ItemList>
    </div>
  );
}
