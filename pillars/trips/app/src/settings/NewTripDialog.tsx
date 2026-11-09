import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle, ErrorState } from '@pops/ui';

import { loadTags, sourceProblem, tripKeys } from '../api/source';
import { defaultClients } from '../api/types';
import { draftInput, draftIssues, tripDraft } from './model';
import { TripForm } from './TripForm';
import { useCreateTrip } from './use-create-trip';

import type { ApiClients, Trip } from '../api/types';

interface Props {
  open: boolean;
  setOpen: (open: boolean) => void;
  trips: Trip[];
  clients?: ApiClients;
  created: (trip: Trip) => void;
}
/** Persist creation through the API; failed or temporarily hidden drafts remain available for correction. */
export function NewTripDialog({ open, setOpen, trips, clients = defaultClients, created }: Props) {
  const { t } = useTranslation('trips');
  const [draft, change] = useState(tripDraft);
  const tags = useQuery({
    queryKey: tripKeys(clients).tags,
    queryFn: () => loadTags(clients),
    enabled: open,
    retry: false,
  });
  const mutation = useCreateTrip(clients, (trip) => {
    change(tripDraft());
    setOpen(false);
    created(trip);
  });
  const submit = (): void => {
    if (!draftIssues(draft, trips, tags.data).length) mutation.create(draftInput(draft));
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) setOpen(next);
      }}
    >
      <DialogContent className="max-h-screen overflow-y-auto bg-card">
        <DialogTitle className="text-base font-semibold">{t('newTrip')}</DialogTitle>
        <DialogDescription className="sr-only">{t('createDescription')}</DialogDescription>
        <TripForm
          draft={draft}
          change={change}
          trips={trips}
          tags={tags.data}
          busy={mutation.isPending}
          mode="create"
          submit={submit}
          cancel={() => {
            change(tripDraft());
            mutation.reset();
            setOpen(false);
          }}
          tagsFailed={tags.isError}
          retryTags={() => {
            void tags.refetch();
          }}
          parentsFailed={false}
          retryParents={() => undefined}
          error={
            mutation.isError && (
              <ErrorState error={sourceProblem(mutation.error)} onRetry={submit} />
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
