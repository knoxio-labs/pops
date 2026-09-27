import { FolderPlus } from 'lucide-react';

import { Button } from '@pops/ui';

import {
  OFFLINE_REASON,
  OFFLINE_TITLE,
  StateBanner,
} from '../../foundation/feedback/state-banner.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { staleTitle } from '../location-page/location-page-state.js';

import type { ReactElement, ReactNode } from 'react';

import type { ChangedElsewhere } from '../../inventory-web/useChangedElsewhere.js';

function OfflineAction({ label }: { label: string }): ReactElement {
  return (
    <HintTooltip label={label} disabledReason={OFFLINE_REASON}>
      <Button disabled aria-disabled="true" prefix={<FolderPlus className="size-4" aria-hidden />}>
        {label}
      </Button>
    </HintTooltip>
  );
}

/** Props for the Locations page's primary create action. */
export interface PageActionProps {
  readonly selectedName: string | null;
  readonly offline: boolean;
  readonly onNewPlace: () => void;
}

/** Renders the page action for creating a root or nested place. */
export function PageAction({ selectedName, offline, onNewPlace }: PageActionProps): ReactElement {
  const label = selectedName === null ? 'New place' : `New place in ${selectedName}`;
  if (offline) return <OfflineAction label={label} />;
  return (
    <Button prefix={<FolderPlus className="size-4" aria-hidden />} onClick={onNewPlace}>
      {label}
    </Button>
  );
}

/** Builds the offline or changed-elsewhere banner for the Locations page. */
export function pageBanner(online: boolean, changed: ChangedElsewhere): ReactNode {
  if (!online) return <StateBanner kind="offline" title={OFFLINE_TITLE} />;
  const group = changed.groups[0];
  if (!changed.stale || group === undefined) return null;
  return (
    <StateBanner
      kind="stale"
      title={staleTitle('Places', group)}
      detail="What you see is from before that change."
      actionLabel="Reload"
      onAction={() => void changed.reload()}
    />
  );
}
