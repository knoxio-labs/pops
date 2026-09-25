import { StateBanner } from '@/kit/inventory/foundation';
/**
 * The generic page states (spec 3.8) as the secondary pages draw them: the
 * stale and offline banners, the failed-load body, and the reason a verb is
 * off while offline. One wording for each, so every page says it the same.
 */
import { CircleAlert } from 'lucide-react';

import { Button } from '@pops/ui';

import { EmptyBody } from './list-parts';

/** Data is not simply fine: changed elsewhere, or no connection. */
export type PageBanner = 'stale' | 'offline';

/** Why a change is off while offline; doubles as the tooltip. */
export const OFFLINE_REASON = 'No connection. Changes are off until it is back.';

/** The stale or offline banner for a page listing `what`. */
export function PageStateBanner({
  banner,
  what,
  onReload,
}: {
  banner: PageBanner | undefined;
  what: string;
  onReload?: () => void;
}) {
  if (banner === 'stale') {
    return (
      <StateBanner
        kind="stale"
        title={`${what} changed elsewhere 2 minutes ago.`}
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
        title="No connection. Showing what loaded."
        detail="Changes are off until the connection is back."
      />
    );
  }
  return null;
}

/** A body that failed to load, with Retry. */
export function LoadFailedBody({ what, onRetry }: { what: string; onRetry?: () => void }) {
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
