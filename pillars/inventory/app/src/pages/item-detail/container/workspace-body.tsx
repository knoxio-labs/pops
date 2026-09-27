import { useCallback } from 'react';

import { useWorkspaceActions } from './use-workspace-actions.js';
import { useWorkspaceState } from './use-workspace-state.js';
import { ContainerWorkspaceView } from './workspace-view.js';

import type { ReactElement } from 'react';

import type { ContainerWorkspaceBodyProps } from './workspace-types.js';

/** Coordinates the container reducer, optimistic verbs, and responsive workspace view. */
export function ContainerWorkspaceBody(props: ContainerWorkspaceBodyProps): ReactElement {
  const resources = useWorkspaceState(props);
  const actions = useWorkspaceActions(props, resources);
  const { onStoreHereChange } = props;
  const onStoreHere = useCallback(() => onStoreHereChange(true), [onStoreHereChange]);
  return (
    <ContainerWorkspaceView
      model={props.model}
      contents={props.contents}
      state={resources.state}
      dispatch={resources.dispatch}
      readOnly={props.readOnly}
      readOnlyReason={resources.readOnlyReason}
      pendingIds={resources.pendingIds}
      rejections={resources.tracked.rejections}
      home={actions.home}
      sections={resources.sections}
      detailsOpen={resources.detailsOpen}
      setDetailsOpen={resources.setDetailsOpen}
      mutationError={resources.mutationError}
      placement={actions.placement}
      recents={props.recents}
      createPlace={props.createPlace}
      moveBusy={actions.moveBusy}
      runMove={actions.runMove}
      lifecycle={actions.lifecycle}
      onLifecycleChange={actions.onLifecycleChange}
      confirmLifecycle={actions.confirmLifecycle}
      storeHereOpen={props.storeHereOpen}
      onStoreHereChange={props.onStoreHereChange}
      storeTarget={props.storeTarget}
      offline={props.offline}
      onExit={actions.onExit}
      onMove={actions.placement.openMove}
      onLabel={actions.onLabel}
      onLifecycle={actions.onLifecycle}
      onStoreHere={props.readOnly ? undefined : onStoreHere}
      onOpen={actions.onOpen}
      onEdit={actions.onEdit}
      onOpenContainer={actions.onOpenContainer}
      onRetire={actions.onRetire}
      onPick={actions.onPick}
    />
  );
}
