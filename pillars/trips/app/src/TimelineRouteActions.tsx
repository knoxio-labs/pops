import { useTranslation } from 'react-i18next';

import { Button, ErrorState } from '@pops/ui';

import { sourceProblem } from './api/source';

import type { TripRouteController } from '@pops/trips-workspace';

/** Expose shared route failure recovery and confirmed own Undo in each contextual editor. */
export function TimelineRouteActions({ route }: { route: TripRouteController }) {
  const { t } = useTranslation('trips');
  return (
    <>
      {route.reading && <p role="status">{t('loading')}</p>}
      {route.readError && <ErrorState error={sourceProblem(route.readError)} />}
      {route.failure && (
        <>
          <p role="status">{t(`timeline.route.${route.failure.kind}`)}</p>
          <ErrorState error={sourceProblem(route.failure.error)} />
          <Button variant="outline" disabled={!!route.pending} onClick={() => void route.retry()}>
            {t('retry')}
          </Button>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={route.reading || !!route.pending}
          onClick={() => void route.reload()}
        >
          {t('timeline.route.reload')}
        </Button>
        <Button variant="outline" disabled={!route.canUndo} onClick={() => void route.undo()}>
          {t('timeline.route.undo')}
        </Button>
      </div>
    </>
  );
}
