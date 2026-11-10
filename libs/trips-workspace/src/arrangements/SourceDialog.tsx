import { useQueryClient } from '@tanstack/react-query';

import { Button, Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from '@pops/ui';

import { EventWorkspace } from '../event/EventWorkspace';
import { JourneyWorkspace } from '../journey/JourneyWorkspace';
import { StayWorkspace } from '../stay/StayWorkspace';
import { arrangementsKey } from './api';
import { ArrangementDocuments } from './ArrangementDocuments';
import { arrangementRows } from './projection';
import { RentalWorkspace } from './RentalWorkspace';
import { Responsibility } from './Responsibility';
import { arrangementTitle } from './source-labels';

import type { JSX } from 'react';

import type { TripDocumentUploadSession } from '../documents/trip-document-upload-session';
import type {
  ArrangementSources,
  ArrangementTarget,
  ArrangementsWorkspaceProps,
  Rental,
} from './types';

type SourceDialogProps = {
  target: ArrangementTarget;
  identity: ArrangementsWorkspaceProps;
  sources: ArrangementSources;
  close: () => void;
  viewJourney: (id: number) => void;
  documents?: TripDocumentUploadSession;
};

/** Opens the actual owning source editor; no arrangement form or source identity is copied or fabricated. */
export function SourceDialog({
  target,
  identity,
  sources,
  close,
  viewJourney,
  documents,
}: SourceDialogProps): JSX.Element {
  const queryClient = useQueryClient();
  const savedRental = (confirmed: Rental): void => {
    queryClient.setQueryData<Rental[]>([...arrangementsKey(identity), 'rentals'], (previous) =>
      previous?.map((candidate) => (candidate.id === confirmed.id ? confirmed : candidate))
    );
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        className="max-h-screen grid-cols-1 overflow-y-auto sm:max-w-5xl"
        showCloseButton={false}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{sourceTitle(target, sources, identity)}</DialogTitle>
        </DialogHeader>
        <DialogClose asChild>
          <Button variant="ghost" className="min-h-11">
            {identity.labels.close}
          </Button>
        </DialogClose>
        <div className="min-w-0">
          <SourceEditor
            target={target}
            identity={identity}
            sources={sources}
            savedRental={savedRental}
            viewJourney={viewJourney}
          />
        </div>
        {documents && (
          <ArrangementDocuments session={documents} identity={identity} target={target} />
        )}
        <Responsibility
          key={`${target.targetKind}:${target.targetId}`}
          identity={identity}
          target={target}
        />
      </DialogContent>
    </Dialog>
  );
}

function SourceEditor({
  target,
  identity,
  sources,
  savedRental,
  viewJourney,
}: {
  target: ArrangementTarget;
  identity: ArrangementsWorkspaceProps;
  sources: ArrangementSources;
  savedRental: (source: Rental) => void;
  viewJourney: (id: number) => void;
}): JSX.Element {
  const props = { tripId: identity.tripId, client: identity.client };
  return (
    <>
      {target.targetKind === 'stay' && <StayWorkspace {...props} stayId={target.targetId} />}
      {target.targetKind === 'event' && <EventWorkspace {...props} eventId={target.targetId} />}
      {target.targetKind === 'journey' && (
        <JourneyWorkspace {...props} journeyId={target.targetId} onViewJourney={viewJourney} />
      )}
      {target.targetKind === 'rental' && (
        <RentalWorkspace
          identity={identity}
          id={target.targetId}
          sources={sources}
          saved={savedRental}
        />
      )}
    </>
  );
}

function sourceTitle(
  target: ArrangementTarget,
  sources: ArrangementSources,
  identity: ArrangementsWorkspaceProps
): string {
  const source = arrangementRows(sources).find(
    (row) => row.kind === target.targetKind && row.source.id === target.targetId
  );
  return source ? arrangementTitle(source, identity.labels) : identity.labels[target.targetKind];
}
