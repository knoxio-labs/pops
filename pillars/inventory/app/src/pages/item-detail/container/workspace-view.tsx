import { PanelRight } from 'lucide-react';

import { Button, Sheet } from '@pops/ui';

import { ContentsPane } from './contents-pane.js';
import { ContainerDetails } from './workspace-details.js';
import { WorkspaceDialogs } from './workspace-dialogs.js';

import type { ReactElement } from 'react';

import type { PlacementTarget } from '../../../foundation/model/model.js';
import type { ItemDetailModel } from '../detail-model.js';
import type { SectionSpec } from '../section-stack.js';
import type { PendingLifecycle } from './container-lifecycle.js';
import type { ContainerPlacementState } from './container-placement.js';
import type { ExitKind, UnpackAction, UnpackState } from './unpack-model.js';
import type { ContainerContentsData } from './use-container-contents.js';
import type { ContainerWorkspaceProps } from './workspace-types.js';

function DetailsToggle({ onOpen }: { onOpen: () => void }): ReactElement {
  return (
    <div className="flex justify-end @2xl:hidden">
      <Button
        size="sm"
        variant="outline"
        prefix={<PanelRight className="size-4" aria-hidden />}
        onClick={onOpen}
      >
        Details
      </Button>
    </div>
  );
}

function WorkspaceContents(props: WorkspaceViewProps): ReactElement {
  return (
    <ContentsPane
      name={props.model.item.name}
      home={props.home}
      world={props.contents.world}
      inside={props.state.inside}
      contentCounts={props.contents.contentCounts}
      state={props.state}
      dispatch={props.dispatch}
      readOnly={props.readOnly}
      readOnlyReason={props.readOnlyReason}
      pendingIds={props.pendingIds}
      rejections={props.rejections}
      onExit={props.onExit}
      onMove={props.onMove}
      onLabel={props.onLabel}
      onLifecycle={props.onLifecycle}
      onStoreHere={props.onStoreHere}
      onOpen={props.onOpen}
      onEdit={props.onEdit}
      onOpenContainer={props.onOpenContainer}
      onRetire={props.onRetire}
    />
  );
}

type WorkspaceViewProps = {
  model: ItemDetailModel;
  contents: ContainerContentsData;
  state: UnpackState;
  dispatch: (action: UnpackAction) => void;
  readOnly: boolean;
  readOnlyReason?: string;
  pendingIds: ReadonlySet<string>;
  rejections: Readonly<Record<string, string>>;
  home: string;
  sections: readonly SectionSpec[];
  detailsOpen: boolean;
  setDetailsOpen: (open: boolean) => void;
  mutationError: string | null;
  placement: ContainerPlacementState;
  recents: ContainerWorkspaceProps['recents'];
  createPlace: ContainerWorkspaceProps['createPlace'];
  moveBusy: boolean;
  runMove: () => Promise<void>;
  lifecycle: PendingLifecycle | undefined;
  onLifecycle: (ids: readonly string[], act: 'retire' | 'discard') => void;
  confirmLifecycle: (reason: string | null) => Promise<void>;
  onLifecycleChange: () => void;
  onPick: (target: PlacementTarget) => void;
  storeHereOpen: boolean;
  onStoreHereChange: ContainerWorkspaceProps['onStoreHereChange'];
  storeTarget: ContainerWorkspaceProps['storeTarget'];
  offline: boolean;
  onExit: (ids: readonly string[], how: ExitKind) => void;
  onMove: (ids: readonly string[]) => void;
  onLabel: (ids: readonly string[]) => void;
  onStoreHere?: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onOpenContainer: () => void;
  onRetire: () => void;
};

/** Renders the contents-first split view and its responsive detail/dialog surfaces. */
export function ContainerWorkspaceView(props: WorkspaceViewProps): ReactElement {
  const { model, sections, detailsOpen, setDetailsOpen, mutationError } = props;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 @2xl:flex-row @2xl:gap-5">
      <DetailsToggle onOpen={() => setDetailsOpen(true)} />
      {mutationError ? (
        <p role="alert" className="text-sm text-destructive @2xl:hidden">
          Not saved. {mutationError}
        </p>
      ) : null}
      <WorkspaceContents {...props} />
      <aside
        aria-label={`About ${model.item.name}`}
        className="hidden w-72 shrink-0 flex-col @2xl:flex @4xl:w-80"
      >
        <ContainerDetails model={model} sections={sections} readOnly={props.readOnly} />
      </aside>
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen} title={`About ${model.item.name}`}>
        <ContainerDetails model={model} sections={sections} readOnly={props.readOnly} />
      </Sheet>
      <WorkspaceDialogs
        placement={props.placement}
        world={props.contents.world}
        recents={props.recents}
        createPlace={props.createPlace}
        onPick={props.onPick}
        moveBusy={props.moveBusy}
        runMove={props.runMove}
        lifecycle={props.lifecycle}
        onLifecycleChange={(open) => {
          if (!open) props.onLifecycleChange();
        }}
        onLifecycleConfirm={props.confirmLifecycle}
        storeHereOpen={props.storeHereOpen}
        onStoreHereChange={props.onStoreHereChange}
        storeTarget={props.storeTarget}
        offline={props.offline}
        readOnly={props.readOnly}
      />
    </div>
  );
}
