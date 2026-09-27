import { CircleAlert } from 'lucide-react';

import { Button, formatRelativeTime } from '@pops/ui';

import { OFFLINE_TITLE, StateBanner } from '../feedback/state-banner.js';
import { EmptyBody } from './list-parts.js';

import type { ReactElement } from 'react';

/** The secondary-page banners that describe data freshness or connectivity. */
export type PageBanner = 'stale' | 'offline';

/** Renders a stale or offline banner, or nothing when the page has no banner. */
export function PageStateBanner({
  banner,
  what,
  changedAt,
  onReload,
}: {
  banner: PageBanner | undefined;
  what: string;
  /** ISO timestamp of the newest change made elsewhere. */
  changedAt?: string | null;
  onReload?: () => void;
}): ReactElement | null {
  if (banner === 'stale') {
    const title = changedAt
      ? `${what} changed elsewhere ${formatRelativeTime(changedAt)}.`
      : `${what} changed elsewhere.`;
    return (
      <StateBanner
        kind="stale"
        title={title}
        detail="What you see and anything selected stay as they are until you reload."
        actionLabel="Reload"
        onAction={onReload}
      />
    );
  }
  if (banner === 'offline') {
    return (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Changes are off until the connection is back."
      />
    );
  }
  return null;
}

/** Renders the standard failed-load state and optional retry action. */
export function LoadFailedBody({
  what,
  onRetry,
}: {
  what: string;
  onRetry?: () => void;
}): ReactElement {
  return (
    <EmptyBody
      icon={CircleAlert}
      title={`${what} did not load`}
      description="The inventory service did not answer. Nothing was changed."
      action={
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}
