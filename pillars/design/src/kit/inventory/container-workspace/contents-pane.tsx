/**
 * The contents-first pane of a container page: what is directly inside,
 * filterable, selectable with the list keys, and acted on in bulk from the
 * shared selection bar. Take out puts things where the container sits;
 * Move asks where; Pick up puts them in hand. The unpack flow's strip,
 * paused notice and outcome question all live inside this pane.
 */
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Input } from '@pops/ui';

import { SelectionBar, deepContents, targetName, useSelection } from '../foundation';
import { barActions } from './contents-actions';
import { ContentsList } from './contents-list';
import { ContentsToolbar } from './contents-toolbar';
import { exitRefusal } from './unpack-model';
import { ClosedPartialNotice, OutcomePanel, UnpackStrip } from './unpack-panels';

import type { ItemRowModel, SelectionApi, SelectionBarAction, SelectionState } from '../foundation';
import type { ItemDetailModel } from '../item-detail/detail-model';
import type { ExitKind, UnpackAction, UnpackState } from './unpack-model';

/** Props for {@link ContentsPane}. */
export interface ContentsPaneProps {
  model: ItemDetailModel;
  state: UnpackState;
  dispatch: (action: UnpackAction) => void;
  initialSelection?: SelectionState;
  initialQuery?: string;
  readOnly: boolean;
  onExit?: (count: number, how: ExitKind) => void;
  onStoreHere?: () => void;
  onMove?: (ids: readonly string[]) => void;
}

function useRows(model: ItemDetailModel, state: UnpackState, query: string): ItemRowModel[] {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.inside
      .map((id) => model.world.items.get(id))
      .filter((row): row is ItemRowModel => row !== undefined)
      .filter((row) => needle === '' || row.name.toLowerCase().includes(needle));
  }, [model.world, state.inside, query]);
}

function nestedCount(model: ItemDetailModel, state: UnpackState): number {
  return state.inside.reduce(
    (sum, id) =>
      sum + (model.world.items.get(id)?.container ? deepContents(model.world, id).length : 0),
    0
  );
}

function homeName(model: ItemDetailModel): string {
  const placement = model.item.placement;
  return placement.kind === 'in-hand' ? 'in hand' : targetName(model.world, placement);
}

function FilterBox({
  name,
  query,
  onQuery,
}: {
  name: string;
  query: string;
  onQuery: (q: string) => void;
}) {
  return (
    <div className="relative w-44">
      <Search
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        aria-label={`Filter what is in ${name}`}
        placeholder="Filter"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        className="h-9 pl-8 text-sm"
      />
    </div>
  );
}

function FlowPanels({
  name,
  state,
  dispatch,
}: Pick<ContentsPaneProps, 'state' | 'dispatch'> & { name: string }) {
  if (state.phase === 'unpacking') return <UnpackStrip state={state} dispatch={dispatch} />;
  if (state.phase === 'closed-partial')
    return <ClosedPartialNotice name={name} state={state} dispatch={dispatch} />;
  if (state.phase === 'emptied' || state.phase === 'confirm-retire') {
    return <OutcomePanel name={name} state={state} dispatch={dispatch} />;
  }
  return null;
}

function DockedBar({
  selection,
  loaded,
  actions,
}: {
  selection: SelectionApi;
  loaded: number;
  actions: SelectionBarAction[];
}) {
  if (selection.count === 0) return null;
  return (
    <div className="absolute inset-x-3 bottom-3">
      <SelectionBar
        count={selection.count}
        loadedCount={loaded}
        coverage={selection.coverage}
        actions={actions}
        onSelectAll={selection.onHeaderToggle}
        onClear={selection.clearSelection}
      />
    </div>
  );
}

/** The contents pane. */
export function ContentsPane(props: ContentsPaneProps) {
  const { model, state, dispatch } = props;
  const [query, setQuery] = useState(props.initialQuery ?? '');
  const rows = useRows(model, state, query);
  const order = useMemo(() => rows.map((row) => row.id), [rows]);
  const selection = useSelection(order, props.initialSelection);
  const name = model.item.name;
  const refusal = props.readOnly ? 'Nothing can change right now.' : exitRefusal(state, name);
  const exit = (ids: readonly string[], how: ExitKind) => {
    dispatch({ type: 'exit', ids, how });
    selection.clearSelection();
    props.onExit?.(ids.length, how);
  };
  const outcome = state.phase === 'emptied' || state.phase === 'confirm-retire';
  const actions = barActions(
    refusal,
    (how) => exit(selection.selectedIds, how),
    () => props.onMove?.(selection.selectedIds)
  );
  return (
    <section
      aria-label={`Inside ${name}`}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card"
    >
      <ContentsToolbar
        count={state.inside.length}
        nested={nestedCount(model, state)}
        state={state}
        dispatch={dispatch}
        readOnly={props.readOnly}
        search={
          state.inside.length === 0 ? null : (
            <FilterBox name={name} query={query} onQuery={setQuery} />
          )
        }
      />
      <FlowPanels name={name} state={state} dispatch={dispatch} />
      {outcome ? null : (
        <ContentsList
          rows={rows}
          model={model}
          selection={selection}
          query={query}
          refusal={refusal}
          home={homeName(model)}
          onClearQuery={() => setQuery('')}
          onStoreHere={props.onStoreHere}
          onExit={exit}
          onMove={props.onMove}
        />
      )}
      <DockedBar selection={selection} loaded={rows.length} actions={actions} />
    </section>
  );
}
