import { ExternalLink, RefreshCw } from 'lucide-react';

import { Button } from '@pops/ui';

import { StateBanner } from '../../foundation/feedback/state-banner';

import type { ReactElement } from 'react';

import type { WebChangeGroup } from '../../inventory-web/useChangedElsewhere.js';
import type { JustCreated } from './use-item-form';

/** The banners shown above the item-form cards. */
export interface FormBannersProps {
  readonly offline: boolean;
  readonly stale: {
    readonly title: string;
    readonly groups: readonly WebChangeGroup[];
    readonly onReload: () => void;
  } | null;
  readonly saveError: { readonly title: string; readonly onRetry: () => void } | null;
  readonly justCreated: (JustCreated & { readonly onOpen: () => void }) | null;
}

function OfflineBanner(): ReactElement {
  return (
    <StateBanner
      kind="offline"
      title="No connection. Changes are off until it is back."
      detail="Offline, so no code can be suggested."
    />
  );
}

function StaleBanner({ stale }: { stale: NonNullable<FormBannersProps['stale']> }): ReactElement {
  return (
    <StateBanner
      kind="stale"
      title={stale.title}
      detail={
        <span className="flex items-center gap-2">
          Saving writes only the fields you change here, so theirs stays unless you change it.
          <Button
            variant="link"
            size="sm"
            className="h-auto min-h-0 p-0"
            onClick={stale.onReload}
            prefix={<RefreshCw className="size-3" aria-hidden />}
          >
            Reload
          </Button>
        </span>
      }
    />
  );
}

function SaveErrorBanner({
  error,
}: {
  error: NonNullable<FormBannersProps['saveError']>;
}): ReactElement {
  return (
    <StateBanner
      kind="error"
      title={error.title}
      actionLabel="Try again"
      onAction={error.onRetry}
    />
  );
}

function CreatedBanner({
  created,
}: {
  created: NonNullable<FormBannersProps['justCreated']>;
}): ReactElement {
  return (
    <StateBanner
      kind="needs-attention"
      title={`Created ${created.name} in ${created.place}. Type and place are kept for the next one.`}
      detail={
        <Button
          variant="link"
          size="sm"
          className="h-auto min-h-0 p-0"
          onClick={created.onOpen}
          prefix={<ExternalLink className="size-3" aria-hidden />}
        >
          Open it
        </Button>
      }
    />
  );
}

/** Renders offline, stale, save-error and save-and-new feedback in order. */
export function FormBanners({
  offline,
  stale,
  saveError,
  justCreated,
}: FormBannersProps): ReactElement | null {
  if (!offline && stale === null && saveError === null && justCreated === null) return null;
  return (
    <div className="mb-5 space-y-2">
      {offline ? <OfflineBanner /> : null}
      {stale ? <StaleBanner stale={stale} /> : null}
      {saveError ? <SaveErrorBanner error={saveError} /> : null}
      {justCreated ? <CreatedBanner created={justCreated} /> : null}
    </div>
  );
}
