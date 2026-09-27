import { useCallback } from 'react';

import { targetName } from '../../../foundation/model/placement-model.js';
import { useContainerExitActions } from './container-exit.js';
import { useContainerItemLifecycle, useContainerAccessActions } from './container-lifecycle.js';
import { useContainerMoveAction } from './container-move.js';
import { useContainerPlacement } from './container-placement.js';
import { useContainerNavigation } from './workspace-navigation.js';

import type { PlacementTarget } from '../../../foundation/model/model.js';
import type { ContainerWorkspaceState } from './use-workspace-state.js';
import type { ContainerWorkspaceBodyProps } from './workspace-types.js';

/** All interactive operations needed by the container workspace view. */
export interface ContainerWorkspaceActions {
  placement: ReturnType<typeof useContainerPlacement>;
  onPick: (target: PlacementTarget) => void;
  home: string;
  onExit: ReturnType<typeof useContainerExitActions>['handleExit'];
  onLabel: ReturnType<typeof useContainerNavigation>['onLabel'];
  onOpen: ReturnType<typeof useContainerNavigation>['onOpen'];
  onEdit: ReturnType<typeof useContainerNavigation>['onEdit'];
  moveBusy: boolean;
  runMove: () => Promise<void>;
  lifecycle: ReturnType<typeof useContainerItemLifecycle>['lifecycle'];
  onLifecycle: ReturnType<typeof useContainerItemLifecycle>['openLifecycle'];
  onLifecycleChange: ReturnType<typeof useContainerItemLifecycle>['closeLifecycle'];
  confirmLifecycle: ReturnType<typeof useContainerItemLifecycle>['confirmLifecycle'];
  onOpenContainer: ReturnType<typeof useContainerAccessActions>['openContainer'];
  onRetire: ReturnType<typeof useContainerAccessActions>['retireEmpty'];
}

type WorkspaceInput = Pick<ContainerWorkspaceBodyProps, 'model' | 'readOnly' | 'contents'>;

function useWorkspacePlacementActions(
  props: WorkspaceInput,
  resources: ContainerWorkspaceState
): Pick<
  ContainerWorkspaceActions,
  'placement' | 'onPick' | 'home' | 'onExit' | 'moveBusy' | 'runMove'
> {
  const placement = useContainerPlacement({
    state: resources.state,
    world: props.contents.world,
    readOnly: props.readOnly,
  });
  const exit = useContainerExitActions({
    state: resources.state,
    world: props.contents.world,
    bulk: resources.bulk,
    tracked: resources.tracked,
    dispatch: resources.dispatch,
    openMove: placement.openMove,
  });
  const move = useContainerMoveAction({
    plan: placement.movePlan,
    readOnly: props.readOnly,
    bulk: resources.bulk,
    tracked: resources.tracked,
    dispatch: resources.dispatch,
    clearMove: placement.clearMove,
  });
  const onPick = useCallback(
    (target: PlacementTarget): void => {
      placement.setPickerOpen(false);
      if (target.kind === 'in-hand') {
        const ids = placement.moveIds;
        placement.clearMove();
        void exit.runExit(ids, 'pick-up');
        return;
      }
      placement.setMoveTarget(target);
    },
    [exit, placement]
  );
  const home =
    props.model.item.placement.kind === 'in-hand'
      ? 'in hand'
      : targetName(props.contents.world, props.model.item.placement);
  return {
    placement,
    onPick,
    home,
    onExit: exit.handleExit,
    moveBusy: move.moveBusy,
    runMove: move.runMove,
  };
}

function useWorkspaceLifecycleActions(
  props: WorkspaceInput,
  resources: ContainerWorkspaceState
): Pick<
  ContainerWorkspaceActions,
  | 'lifecycle'
  | 'onLifecycle'
  | 'onLifecycleChange'
  | 'confirmLifecycle'
  | 'onOpenContainer'
  | 'onRetire'
  | 'onLabel'
  | 'onOpen'
  | 'onEdit'
> {
  const lifecycle = useContainerItemLifecycle({
    state: resources.state,
    readOnly: props.readOnly,
    bulk: resources.bulk,
    tracked: resources.tracked,
    dispatch: resources.dispatch,
  });
  const access = useContainerAccessActions({
    itemId: props.model.item.id,
    itemName: props.model.item.name,
    currentAccess: resources.currentAccess,
    phase: resources.state.phase,
    readOnly: props.readOnly,
    itemVerbs: resources.itemVerbs,
    dispatch: resources.dispatch,
    setMutationError: resources.setMutationError,
  });
  const navigation = useContainerNavigation(props.readOnly);
  return {
    lifecycle: lifecycle.lifecycle,
    onLifecycle: lifecycle.openLifecycle,
    onLifecycleChange: lifecycle.closeLifecycle,
    confirmLifecycle: lifecycle.confirmLifecycle,
    onOpenContainer: access.openContainer,
    onRetire: access.retireEmpty,
    onLabel: navigation.onLabel,
    onOpen: navigation.onOpen,
    onEdit: navigation.onEdit,
  };
}

/** Composes placement, optimistic mutation, lifecycle, and row navigation hooks. */
export function useWorkspaceActions(
  props: WorkspaceInput,
  resources: ContainerWorkspaceState
): ContainerWorkspaceActions {
  const placement = useWorkspacePlacementActions(props, resources);
  const lifecycle = useWorkspaceLifecycleActions(props, resources);
  return { ...placement, ...lifecycle };
}
