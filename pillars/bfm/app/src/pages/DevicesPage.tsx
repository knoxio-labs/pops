import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Badge } from '@pops/ui';

import { isUnavailableError, unwrap } from '../bfm-api-helpers.js';
import { health } from '../bfm-api/index.js';

import type { ComponentProps, ReactElement } from 'react';

/**
 * `/bfm` — placeholder for the operator's device surface.
 *
 * The real page (pairing QR, device list, revoke) is POPS-1387. What this
 * renders today is the pillar's reachability, driven by the same generated
 * client, `/bfm-api` proxy path and `isUnavailableError` classification that
 * page will use — so a broken proxy or a wrong `baseUrl` surfaces here
 * rather than looking like a pairing bug later.
 */
export function DevicesPage(): ReactElement {
  const { t } = useTranslation('bfm');
  const reachability = useBfmReachability();

  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">{t('devices.title')}</h1>
        <p className="text-muted-foreground">{t('devices.intro')}</p>
      </header>

      <section aria-labelledby="bfm-reachability" className="space-y-2">
        <h2 id="bfm-reachability" className="text-sm font-medium">
          {t('devices.reachability.heading')}
        </h2>
        <ReachabilityBadge state={reachability} />
      </section>

      <p className="text-sm text-muted-foreground">{t('devices.pending')}</p>
    </div>
  );
}

/**
 * `unavailable` means the pillar was unreachable or answered 5xx; `error` is a
 * refusal that carried a status, which is a different operator problem
 * (routing, auth) and must not be collapsed into "bfm is down".
 */
type ReachabilityState = 'loading' | 'reachable' | 'unavailable' | 'error';

function useBfmReachability(): ReachabilityState {
  const query = useQuery({
    queryKey: ['bfm', 'health'],
    queryFn: async () => unwrap(await health()),
    retry: false,
  });

  if (query.isLoading) return 'loading';
  if (query.error !== null) return isUnavailableError(query.error) ? 'unavailable' : 'error';
  return 'reachable';
}

/** Sourced from `Badge` so a variant rename in `@pops/ui` breaks here, not silently. */
type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

const REACHABILITY_BADGES: Record<ReachabilityState, { variant: BadgeVariant; labelKey: string }> =
  {
    loading: { variant: 'secondary', labelKey: 'devices.reachability.loading' },
    reachable: { variant: 'default', labelKey: 'devices.reachability.reachable' },
    unavailable: { variant: 'destructive', labelKey: 'devices.reachability.unavailable' },
    error: { variant: 'outline', labelKey: 'devices.reachability.error' },
  };

function ReachabilityBadge({ state }: { state: ReachabilityState }): ReactElement {
  const { t } = useTranslation('bfm');
  const { variant, labelKey } = REACHABILITY_BADGES[state];
  return (
    <Badge variant={variant} role="status" data-reachability={state}>
      {t(labelKey)}
    </Badge>
  );
}
