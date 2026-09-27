import { carriedCount } from '../../../foundation/list-page/selection-actions.js';
import { SelectionDock, ContentsFlow, ContentsFilter } from './contents-flow.js';
import { ContentsList } from './contents-list.js';
import { nestedContentCount } from './contents-model.js';
import { ContentsToolbar } from './contents-toolbar.js';

import type { ReactElement } from 'react';

import type { SelectionBarAction } from '../../../foundation/model/contracts.js';
import type { ItemRowModel } from '../../../foundation/model/model.js';
import type { SelectionApi } from '../../../foundation/selection/use-selection.js';
import type { ContentsPaneProps } from './workspace-types.js';

type LayoutProps = ContentsPaneProps & {
  query: string;
  rows: ItemRowModel[];
  selection: SelectionApi;
  actions: readonly SelectionBarAction[];
  refusal: string | null;
  onQuery: (value: string) => void;
};

function ContentsHeader({
  name,
  inside,
  world,
  contentCounts,
  state,
  dispatch,
  readOnly,
  readOnlyReason,
  query,
  onQuery,
  onOpenContainer,
  onRetire,
}: LayoutProps): ReactElement {
  return (
    <>
      <ContentsToolbar
        count={inside.length}
        nested={nestedContentCount(inside, world, contentCounts)}
        state={state}
        dispatch={dispatch}
        readOnly={readOnly}
        readOnlyReason={readOnlyReason}
        search={
          inside.length === 0 ? null : (
            <ContentsFilter name={name} query={query} onQuery={onQuery} />
          )
        }
      />
      <ContentsFlow
        name={name}
        state={state}
        dispatch={dispatch}
        readOnly={readOnly}
        onOpenContainer={onOpenContainer}
        onRetire={onRetire}
      />
    </>
  );
}

function ContentsRows({
  outcome,
  rows,
  world,
  name,
  home,
  query,
  refusal,
  selection,
  onQuery,
  onStoreHere,
  onExit,
  onMove,
  onOpen,
  onEdit,
  pendingIds,
  rejections,
}: LayoutProps & { outcome: boolean }): ReactElement | null {
  if (outcome) return null;
  return (
    <ContentsList
      rows={rows}
      world={world}
      name={name}
      home={home}
      query={query}
      refusal={refusal}
      selection={selection}
      onClearQuery={() => onQuery('')}
      onStoreHere={onStoreHere}
      onExit={(ids, how) => {
        selection.clearSelection();
        onExit(ids, how);
      }}
      onMove={(ids) => {
        selection.clearSelection();
        onMove(ids);
      }}
      onOpen={onOpen}
      onEdit={onEdit}
      pendingIds={pendingIds}
      rejections={rejections}
    />
  );
}

/** Renders the contents pane layout around its reducer-driven child components. */
export function ContentsPaneLayout(props: LayoutProps): ReactElement {
  const outcome =
    props.state.phase === 'kept' ||
    props.state.phase === 'retired' ||
    props.state.phase === 'emptied' ||
    props.state.phase === 'confirm-retire';
  return (
    <section
      aria-label={`Inside ${props.name}`}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card"
    >
      <ContentsHeader {...props} />
      <ContentsRows {...props} outcome={outcome} />
      <SelectionDock
        selection={props.selection}
        loaded={props.rows.length}
        carried={carriedCount(props.selection.selectedIds, props.contentCounts, props.world)}
        actions={props.actions}
      />
      {props.readOnly && props.inside.length > 0 ? (
        <p className="sr-only" role="status">
          {props.readOnlyReason ?? 'Nothing can change right now.'}
        </p>
      ) : null}
    </section>
  );
}
