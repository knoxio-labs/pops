import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { ErrorState } from '@pops/ui';

import { readOwner } from '../api/read-owner';
import { loadTrips, loadTags, sourceProblem, tripKeys } from '../api/source';
import { SourceFailure } from '../api/SourceFailure';
import { defaultClients } from '../api/types';
import { sourceId } from '../source-id';
import { client as tagsClient } from '../tags-api/client.gen';
import { client as tripClient } from '../trips-api/client.gen';
import { SettingsHeader } from './SettingsHeader';
import { TripForm } from './TripForm';
import { useTripMetadataRead } from './use-metadata-source';
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
    <TripSettingsContext tripId={id} />
  );
}

/** Canonical metadata form for one explicit Trip; contextual mode keeps navigation with its Timeline host. */
export function TripSettingsContext({
  tripId,
  clients = defaultClients,
  contextual = false,
}: {
  tripId: number;
  clients?: ApiClients;
  contextual?: boolean;
}) {
  if (!Number.isSafeInteger(tripId) || tripId < 1)
    return (
      <ErrorState
        error={{ code: 'trips.identity.invalid', message: 'Choose a valid trip', retryable: false }}
      />
    );
  return (
    <LoadSettings
      key={`${(clients.tripClient ?? tripClient).getConfig().baseUrl}:${tripId}`}
      id={tripId}
      clients={clients}
      contextual={contextual}
    />
  );
}

function LoadSettings({
  id,
  clients,
  contextual,
}: {
  id: number;
  clients: ApiClients;
  contextual: boolean;
}) {
  const { t } = useTranslation('trips');
  const source = useTripMetadataRead(id, clients);
  const value = source.data ?? source.retainedSource;
  if (source.ownershipError) return <ErrorState error={source.ownershipError} />;
  if (value === undefined) {
    if (source.isError) return <SourceFailure error={source.error} retry={source.refetch} />;
    return <p role="status">{t('loading')}</p>;
  }
  return (
    <>
      {source.isPending && <p role="status">{t('loading')}</p>}
      {source.isError && <SourceFailure error={source.error} retry={source.refetch} />}
      <SettingsSource source={value} clients={clients} contextual={contextual} />
    </>
  );
}
function SettingsSource({
  source,
  clients,
  contextual,
}: {
  source: Trip;
  clients: ApiClients;
  contextual: boolean;
}) {
  const keys = tripKeys(clients);
  const owner = clients.tripClient ?? tripClient;
  const tagOwner = clients.tagsClient ?? tagsClient;
  const origin = owner.getConfig().baseUrl;
  const [tagOrigin] = useState(() => tagOwner.getConfig().baseUrl);
  const tagsChanged = tagOwner.getConfig().baseUrl !== tagOrigin;
  const trips = useQuery({
    queryKey: keys.all,
    queryFn: () => readOwner(owner, origin, () => loadTrips(clients)),
    retry: false,
  });
  const tags = useQuery({
    queryKey: keys.tags,
    queryFn: () => readOwner(tagOwner, tagOrigin, () => loadTags(clients)),
    retry: false,
  });
  const editor = useTripEditor(source, clients);
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <SettingsHeader editor={editor} contextual={contextual} />
      <div className="rounded-xl border border-foreground/30 bg-muted/60 p-5 shadow-sm">
        <TripForm
          draft={editor.draft}
          previous={editor.previous}
          change={editor.change}
          trips={trips.data}
          tags={tagsChanged ? undefined : tags.data}
          id={source.id}
          busy={editor.busy}
          pristine={!editor.dirty}
          discard={editor.discard}
          mode="settings"
          submit={() => {
            void editor.save();
          }}
          tagsFailed={tagsChanged || tags.isError}
          retryTags={() => {
            void tags.refetch();
          }}
          parentsFailed={trips.isError}
          retryParents={() => {
            void trips.refetch();
          }}
          error={<MetadataFailure editor={editor} />}
        />
      </div>
    </main>
  );
}

function MetadataFailure({ editor }: { editor: ReturnType<typeof useTripEditor> }) {
  if (!editor.failure) return null;
  return (
    <ErrorState error={sourceProblem(editor.failure.error)} onRetry={() => void editor.retry()} />
  );
}
