import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Button, PageHeader } from '@pops/ui';

import { tripKeys } from '../api/source';
import { SourceFailure } from '../api/SourceFailure';
import { defaultClients } from '../api/types';
import { NewTripDialog } from '../settings/NewTripDialog';
import { HomeToolbar } from './HomeToolbar';
import { filteredRecords } from './model';
import { TripRows } from './TripRows';
import { useHomeSources } from './use-home-sources';
import { useToday } from './use-today';

import type { ApiClients, Trip, Place } from '../api/types';
import type { HomeFilter, HomeRecord } from './model';

/** Approved grouped home scopes source selection and editable drafts to the actual API origin. */
export function HomePage({ clients = defaultClients }: { clients?: ApiClients }) {
  return <HomeSession key={tripKeys(clients).all.join(':')} clients={clients} />;
}
function HomeSession({ clients }: { clients: ApiClients }) {
  const { t } = useTranslation('trips');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<HomeFilter>('all');
  const [open, setOpen] = useState(false);
  const referenceDate = useToday();
  const { trips, places, visits, retryContext } = useHomeSources(clients);
  if (trips.isPending) return <p role="status">{t('loading')}</p>;
  if (trips.isError && trips.data === undefined)
    return <SourceFailure error={trips.error} retry={trips.refetch} />;
  const records: HomeRecord[] = trips.data.map((trip, index) => ({
    trip,
    visits: visits[index]?.data,
  }));
  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 text-sm md:py-8">
      {trips.isError && <SourceFailure error={trips.error} retry={trips.refetch} />}
      {(places.isError || visits.some((visit) => visit.isError)) && (
        <ContextFailure retry={retryContext} />
      )}
      <HomeBrowse
        records={records}
        allTrips={trips.data}
        places={places.data ?? []}
        referenceDate={referenceDate}
        query={query}
        setQuery={setQuery}
        bucket={bucket}
        setBucket={setBucket}
        create={() => setOpen(true)}
        select={(id) => void navigate(`/trips/${id}`)}
      />
      <NewTripDialog
        open={open}
        setOpen={setOpen}
        trips={trips.data}
        clients={clients}
        created={(trip) => void navigate(`/trips/${trip.id}`)}
      />
    </main>
  );
}

interface BrowseProps {
  records: HomeRecord[];
  allTrips: Trip[];
  places: Place[];
  referenceDate: string;
  query: string;
  setQuery: (query: string) => void;
  bucket: HomeFilter;
  setBucket: (bucket: HomeFilter) => void;
  create: () => void;
  select: (id: number) => void;
}
function HomeBrowse(props: BrowseProps) {
  const { t } = useTranslation('trips');
  return (
    <>
      <PageHeader title={t('title')} />
      <HomeToolbar {...props} />
      <TripRows
        records={filteredRecords(props)}
        allTrips={props.allTrips}
        places={props.places}
        referenceDate={props.referenceDate}
        onSelect={props.select}
      />
    </>
  );
}

function ContextFailure({ retry }: { retry: () => void }) {
  const { t } = useTranslation('trips');
  return (
    <p role="status" className="text-muted-foreground">
      {t('contextUnavailable')}{' '}
      <Button variant="ghost" className="min-h-11" onClick={retry}>
        {t('retry')}
      </Button>
    </p>
  );
}
