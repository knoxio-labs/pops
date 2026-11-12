import { useTranslation } from 'react-i18next';

import { unwrap } from '@pops/pillar-sdk/client';
import { assertSourceOwner, useSourceQuery } from '@pops/trips-workspace';
import { Button, Select } from '@pops/ui';

import { client as defaultClient } from './trips-api/client.gen';
import { placesList } from './trips-api/sdk.gen';

import type { TimelineContextProps } from './timeline-context-types';
import type { TimelineCreateSession } from './timeline-create-session';

/** Select an existing place or explicitly capture one before creating a distinct Visit occurrence. */
export function TimelineCreatePlace({
  tripId,
  client,
  onSelect,
  session,
  state,
  locked,
}: Pick<TimelineContextProps, 'tripId' | 'client' | 'onSelect'> & {
  session: TimelineCreateSession;
  state: ReturnType<TimelineCreateSession['snapshot']>;
  locked: boolean;
}) {
  const { t } = useTranslation('trips');
  const places = useCreatePlaces(tripId, client);
  if (places.ownershipError) return <p role="alert">{t('overview.status.connectionChanged')}</p>;
  const selected = state.placeId;
  const options = (places.data ?? []).map((place) => ({
    value: String(place.id),
    label: place.name,
  }));
  if (selected !== null && !options.some((option) => option.value === String(selected)))
    options.push({
      value: String(selected),
      label: t('referenceUnavailable', { value: selected }),
    });
  return (
    <div className="space-y-2">
      <Select
        label={t('timeline.create.place')}
        value={selected === null ? '' : String(selected)}
        disabled={locked}
        options={[{ value: '', label: t('timeline.create.choosePlace') }, ...options]}
        onChange={(event) =>
          session.edit({ placeId: event.target.value === '' ? null : Number(event.target.value) })
        }
      />
      {places.isError && <p role="alert">{t('timeline.create.placesFailed')}</p>}
      {(places.isError || places.isPending) && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => void places.refetch()}
        >
          {t('retry')}
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={locked}
        onClick={() => onSelect({ kind: 'create', sourceKind: 'place' })}
      >
        {t('timeline.create.newPlace')}
      </Button>
    </div>
  );
}

function useCreatePlaces(tripId: number, client: TimelineContextProps['client']) {
  return useSourceQuery(
    { client: client ?? defaultClient, tripId, kind: 'timeline-create-places', sourceId: 0 },
    (owner) => ({
      queryKey: ['trips', owner.origin, 'places'],
      load: async () => {
        const data = unwrap(await placesList({ client: owner.client })).places;
        assertSourceOwner(owner);
        return data;
      },
    })
  );
}
