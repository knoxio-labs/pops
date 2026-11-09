import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { ErrorState } from '@pops/ui';

import { loadTrip, loadTrips, loadTags, sourceProblem, tripKeys } from '../api/source';
import { defaultClients } from '../api/types';
import { sourceId } from '../source-id';
import { SettingsHeader } from './SettingsHeader';
import { TripForm } from './TripForm';
import { useTripEditor } from './use-trip-editor';

import type { ApiClients, Trip } from '../api/types';

/** D06 metadata editor loads the actual route identity; invalid IDs never issue a source request. */
export function TripSettingsPage() {
  const { tripId } = useParams();
  const id = sourceId(tripId);
  return id === undefined ? (
    <ErrorState
      error={{ code: 'trips.identity.invalid', message: 'Choose a valid trip', retryable: false }}
    />
  ) : (
    <LoadSettings key={id} id={id} />
  );
}
function LoadSettings({ id, clients = defaultClients }: { id: number; clients?: ApiClients }) {
  const { t } = useTranslation('trips');
  const keys = tripKeys(clients);
  const source = useQuery({
    queryKey: keys.one(id),
    queryFn: () => loadTrip(id, clients),
    retry: false,
  });
  if (source.isPending) return <p role="status">{t('loading')}</p>;
  if (source.isError)
    return (
      <ErrorState
        error={sourceProblem(source.error)}
        onRetry={() => {
          void source.refetch();
        }}
      />
    );
  return <SettingsSource source={source.data} clients={clients} />;
}
function SettingsSource({ source, clients }: { source: Trip; clients: ApiClients }) {
  const keys = tripKeys(clients);
  const trips = useQuery({ queryKey: keys.all, queryFn: () => loadTrips(clients), retry: false });
  const tags = useQuery({ queryKey: keys.tags, queryFn: () => loadTags(clients), retry: false });
  const editor = useTripEditor(source, clients);
  const error = editor.failure && (
    <ErrorState
      error={sourceProblem(editor.failure.error)}
      onRetry={() => {
        void editor.retry();
      }}
    />
  );
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <SettingsHeader editor={editor} />
      <div className="rounded-xl border border-foreground/30 bg-muted/60 p-5 shadow-sm">
        <TripForm
          draft={editor.draft}
          previous={editor.previous}
          change={editor.change}
          trips={trips.data}
          tags={tags.data}
          id={source.id}
          busy={editor.busy}
          pristine={!editor.dirty}
          discard={editor.discard}
          mode="settings"
          submit={() => {
            void editor.save();
          }}
          tagsFailed={tags.isError}
          retryTags={() => {
            void tags.refetch();
          }}
          parentsFailed={trips.isError}
          retryParents={() => {
            void trips.refetch();
          }}
          error={error}
        />
      </div>
    </main>
  );
}
