import { useMemo } from 'react';

import { cn } from '@pops/ui';

import {
  OFFLINE_REASON,
  OFFLINE_TITLE,
  StateBanner,
} from '../../../foundation/feedback/state-banner.js';
import { PAGE_HEIGHT } from '../../../foundation/item-page/section-parts.js';
import { useContainerContents } from './use-container-contents.js';
import { ContainerWorkspaceBody } from './workspace-body.js';
import { contentsErrorDetail, contentsErrorTitle, mergeWorld } from './workspace-model.js';

import type { ReactElement, ReactNode } from 'react';

import type { ContainerWorkspaceProps } from './workspace-types.js';

export type { ContainerWorkspaceProps } from './workspace-types.js';

function WorkspaceFrame({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className={cn(PAGE_HEIGHT, '@container flex min-h-0 flex-col gap-3')}>{children}</div>
  );
}

function LoadingState({ name }: { name: string }): ReactElement {
  return (
    <WorkspaceFrame>
      <p role="status" className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Loading what is inside {name}…
      </p>
    </WorkspaceFrame>
  );
}

function UnavailableState({
  offline,
  onRetry,
}: {
  offline: boolean;
  onRetry: () => void;
}): ReactElement {
  return (
    <WorkspaceFrame>
      <StateBanner
        kind={offline ? 'offline' : 'error'}
        title={contentsErrorTitle(offline)}
        detail={contentsErrorDetail(offline)}
        actionLabel={offline ? undefined : 'Retry'}
        onAction={onRetry}
      />
    </WorkspaceFrame>
  );
}

function PartialError({
  offline,
  onRetry,
}: {
  offline: boolean;
  onRetry: () => void;
}): ReactElement {
  return (
    <StateBanner
      kind={offline ? 'offline' : 'error'}
      title={offline ? OFFLINE_TITLE : 'Could not load container contents.'}
      detail={offline ? OFFLINE_REASON : 'Retry to read the items directly inside this container.'}
      actionLabel={offline ? undefined : 'Retry'}
      onAction={onRetry}
    />
  );
}

/** Renders the loaded container contents workspace, including its direct-content read. */
export function ContainerWorkspace(props: ContainerWorkspaceProps): ReactElement {
  const baseWorld = useMemo(
    () => mergeWorld(props.model.world, props.placementWorld),
    [props.model.world, props.placementWorld]
  );
  const contents = useContainerContents(props.model.item.id, baseWorld);
  if (contents.status === 'pending' && contents.rows.length === 0) {
    return <LoadingState name={props.model.item.name} />;
  }
  if (contents.status === 'error' && contents.rows.length === 0) {
    return <UnavailableState offline={props.offline} onRetry={contents.refetch} />;
  }
  return (
    <WorkspaceFrame>
      {contents.status === 'error' ? (
        <PartialError offline={props.offline} onRetry={contents.refetch} />
      ) : null}
      <ContainerWorkspaceBody {...props} contents={contents} />
    </WorkspaceFrame>
  );
}
