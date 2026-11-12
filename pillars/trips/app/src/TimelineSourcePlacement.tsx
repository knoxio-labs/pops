import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useTripRoute } from '@pops/trips-workspace';
import { Button, Select } from '@pops/ui';

import { TimelineRouteActions } from './TimelineRouteActions';

import type { RouteIdentity, RouteItem, RouteSource, TripRoute } from '@pops/trips-workspace';

/** Move one literal Visit or Journey to an explicitly selected current root/path position. */
export function TimelineSourcePlacement({
  identity,
  source,
}: {
  identity: RouteIdentity;
  source: RouteSource;
}) {
  const { t } = useTranslation('trips');
  const route = useTripRoute(identity);
  const [destinationKey, setDestinationKey] = useState('');
  const [beforeKey, setBeforeKey] = useState('');
  const current = route.view?.route;
  const path = current?.paths.find(
    (item) => item.state === 'alternative' && `path:${item.id}` === destinationKey
  );
  const root = destinationKey === 'route';
  const items = root ? current?.order : path?.members;
  const before = items?.find((item) => `${item.kind}:${item.id}` === beforeKey);
  const available = placementAvailable(!!current, root || !!path, beforeKey, !!before);
  const move = () => {
    if (!available) return;
    if (root)
      void route.run({
        kind: 'source.move',
        source,
        destination: { kind: 'route', before: before ?? null },
      });
    else if (path && before?.kind !== 'gap')
      void route.run({
        kind: 'source.move',
        source,
        destination: { kind: 'path', pathId: path.id, before: before ?? null },
      });
  };
  const controls = { current, items, destinationKey, beforeKey, setDestinationKey, setBeforeKey };
  return (
    <section className="space-y-3 border-t pt-4" aria-label={t('timeline.route.placement')}>
      <TimelineRouteActions route={route} />
      <PlacementInputs {...controls} />
      <Button disabled={!available || !!route.pending || !!route.failure} onClick={move}>
        {t('timeline.route.move')}
      </Button>
    </section>
  );
}

function PlacementInputs({
  current,
  items,
  destinationKey,
  beforeKey,
  setDestinationKey,
  setBeforeKey,
}: {
  current: TripRoute | undefined;
  items: readonly RouteItem[] | undefined;
  destinationKey: string;
  beforeKey: string;
  setDestinationKey: (key: string) => void;
  setBeforeKey: (key: string) => void;
}) {
  const { t } = useTranslation('trips');
  return (
    <>
      <Select
        label={t('timeline.route.destination')}
        value={destinationKey}
        placeholder={t('timeline.route.chooseDestination')}
        options={[
          { value: 'route', label: t('overview.route') },
          ...(current?.paths
            .filter((item) => item.state === 'alternative')
            .map((item) => ({
              value: `path:${item.id}`,
              label: `${item.title} · ${t('timeline.route.pathIdentity', { id: item.id })}`,
            })) ?? []),
        ]}
        onChange={(event) => {
          setDestinationKey(event.target.value);
          setBeforeKey('');
        }}
      />
      <Select
        label={t('timeline.route.before')}
        value={beforeKey}
        options={[
          { value: '', label: t('timeline.route.end') },
          ...(items?.map((item) => ({
            value: `${item.kind}:${item.id}`,
            label: t('overview.source', { kind: t(`overview.kinds.${item.kind}`), id: item.id }),
          })) ?? []),
        ]}
        onChange={(event) => setBeforeKey(event.target.value)}
      />
    </>
  );
}

function placementAvailable(
  loaded: boolean,
  destination: boolean,
  beforeKey: string,
  anchored: boolean
) {
  return loaded && destination && (beforeKey === '' || anchored);
}
