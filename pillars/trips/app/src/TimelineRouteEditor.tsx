import { useTranslation } from 'react-i18next';

import { useTripRoute } from '@pops/trips-workspace';

import { TimelinePathControls } from './TimelinePathControls';
import { TimelineRouteActions } from './TimelineRouteActions';
import { TimelineRouteOrder } from './TimelineRouteOrder';

import type { OverviewPlacementTarget, RouteIdentity } from '@pops/trips-workspace';

/** Bind contextual placement controls to the shared retained route controller and literal structural target. */
export function TimelineRouteEditor({
  identity,
  target,
}: {
  identity: RouteIdentity;
  target: OverviewPlacementTarget | null;
}) {
  const route = useTripRoute(identity);
  const { t } = useTranslation('trips');
  const current = route.view?.route;
  const available =
    !target ||
    (target.kind === 'gap'
      ? current?.order.some((item) => item.kind === 'gap' && item.id === target.id)
      : current?.paths.some((path) => path.id === target.id));
  return (
    <section className="min-w-0 space-y-4" aria-label={t('timeline.route.title')}>
      <TimelineRouteActions route={route} />
      {current && !available && <p role="alert">{t('timeline.route.unavailable')}</p>}
      {current && available && (
        <>
          <TimelineRouteOrder route={route} />
          <TimelinePathControls route={route} target={target} />
        </>
      )}
    </section>
  );
}
