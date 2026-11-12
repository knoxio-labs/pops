import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle, ErrorState } from '@pops/ui';

import { loadTags, sourceProblem, tripKeys } from '../api/source';
import { defaultClients } from '../api/types';
import { draftIssues } from './model';
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
/** Recover the original durable creation attempt through the existing form; Close never forgets an unknown outcome. */
export function NewTripDialog({ open, setOpen, trips, clients = defaultClients, created }: Props) {
  const { t } = useTranslation('trips');
  const tags = useQuery({
    queryKey: tripKeys(clients).tags,
    queryFn: () => loadTags(clients),
    enabled: open,
    retry: false,
  });
  const mutation = useCreateTrip(
    clients,
    (trip) => {
      setOpen(false);
      created(trip);
    },
    open
  );
  const { draft } = mutation;
  const submit = (): void => {
    if (!draftIssues(draft, trips, tags.data).length) mutation.create();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-screen overflow-y-auto bg-card">
        <DialogTitle className="text-base font-semibold">{t('newTrip')}</DialogTitle>
        <DialogDescription className="sr-only">{t('createDescription')}</DialogDescription>
        <TripForm
          draft={draft}
          change={mutation.change}
          trips={trips}
          tags={tags.data}
          busy={mutation.busy}
          locked={mutation.locked}
          mode="create"
          submit={submit}
          cancel={() => {
            mutation.cancel();
            setOpen(false);
          }}
          tagsFailed={tags.isError}
          retryTags={() => {
            void tags.refetch();
          }}
          parentsFailed={false}
          retryParents={() => undefined}
          error={
            mutation.error !== undefined && (
              <ErrorState
                error={sourceProblem(mutation.error)}
                onRetry={mutation.canRetry ? mutation.retry : undefined}
              />
            )
          }
        />
      </DialogContent>
    </Dialog>
  );
}
