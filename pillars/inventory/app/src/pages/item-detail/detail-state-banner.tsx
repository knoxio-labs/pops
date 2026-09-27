import { OFFLINE_TITLE, StateBanner } from '../../foundation/feedback/state-banner.js';

import type { ReactElement } from 'react';

import type { ItemDetailBannerState } from './use-item-detail-state';

/** Props for the loaded item-detail read-state banner. */
export interface DetailStateBannerProps {
  readonly state: ItemDetailBannerState;
  readonly onRetry: () => void;
}

/** Renders the single actionable banner for an incomplete item-detail read. */
export function DetailStateBanner({ state, onRetry }: DetailStateBannerProps): ReactElement {
  if (state === 'partial') {
    return (
      <StateBanner
        kind="needs-attention"
        title="Some item details are still loading."
        detail="The item is usable, but some sections may be incomplete."
        actionLabel="Retry"
        onAction={onRetry}
      />
    );
  }

  return (
    <StateBanner
      kind="offline"
      title={OFFLINE_TITLE}
      detail="Some sections may be incomplete until the connection returns."
      actionLabel="Retry"
      onAction={onRetry}
    />
  );
}
