import { createClient as createDocumentsClient } from '../documents-api/client';
import { EventWorkspace } from '../event/EventWorkspace';
import { eventTransport, sourceEvent } from '../event/test-utils';
import { JourneyWorkspace } from '../journey/JourneyWorkspace';
import { journeyTransport, sourceJourney, sourceLeg } from '../journey/test-utils';
import { StayWorkspace } from '../stay/StayWorkspace';
import { problem, sourceStay, workspaceTransport } from '../stay/test-utils';

import type { ReactElement } from 'react';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { DocumentAssociationTarget } from '../documents/types';
import type { TestResponse } from '../stay/test-utils';
import type { Client as TripsClient } from '../trips-api/client';

/** Source-host test seam retaining each real generated source client and write history. */
export interface SourceDocumentHost {
  element: ReactElement;
  client: TripsClient;
  documentsClient: DocumentsClient;
  target: DocumentAssociationTarget;
  label: string;
  initial: string | null;
  next: string;
  writes: () => unknown[];
}

/** Actual source hosts and generated transports, with explicit failed-save and Undo responses. */
export function sourceDocumentHost(
  kind: 'event' | 'stay' | 'journey',
  failFirst = false
): SourceDocumentHost {
  const documentsClient = createDocumentsClient({ baseUrl: 'http://documents.test' });
  if (kind === 'event') return eventHost(documentsClient, failFirst);
  if (kind === 'stay') return stayHost(documentsClient, failFirst);
  return journeyHost(documentsClient, failFirst);
}

function failureReplies(failFirst: boolean): TestResponse[] {
  return failFirst ? [{ status: 503, body: problem('trips.temporarily_unavailable') }] : [];
}

function eventHost(documentsClient: DocumentsClient, failFirst: boolean): SourceDocumentHost {
  const original = sourceEvent();
  const changed = sourceEvent({ name: 'Edited source' });
  const transport = eventTransport({
    replies: [
      ...failureReplies(failFirst),
      { status: 200, body: changed },
      { status: 200, body: original },
    ],
  });
  return {
    element: (
      <EventWorkspace
        tripId={7}
        eventId={19}
        client={transport.client}
        documentsClient={documentsClient}
      />
    ),
    client: transport.client,
    documentsClient,
    target: { kind: 'event', id: 19 },
    label: 'Event name',
    initial: original.name,
    next: 'Edited source',
    writes: () => transport.patches,
  };
}

function stayHost(documentsClient: DocumentsClient, failFirst: boolean): SourceDocumentHost {
  const original = sourceStay();
  const changed = sourceStay({ name: 'Edited source' });
  const transport = workspaceTransport({
    patches: [
      ...failureReplies(failFirst),
      { status: 200, body: changed },
      { status: 200, body: original },
    ],
  });
  return {
    element: (
      <StayWorkspace
        tripId={7}
        stayId={13}
        client={transport.client}
        documentsClient={documentsClient}
      />
    ),
    client: transport.client,
    documentsClient,
    target: { kind: 'stay', id: 13 },
    label: 'Stay name',
    initial: original.name,
    next: 'Edited source',
    writes: () => transport.patches,
  };
}

function journeyHost(documentsClient: DocumentsClient, failFirst: boolean): SourceDocumentHost {
  const original = sourceLeg();
  const changed = sourceLeg({ mode: 'Edited source' });
  const transport = journeyTransport({
    source: { journey: sourceJourney(), legs: [original], legRevision: 0 },
    writes: [
      ...failureReplies(failFirst),
      { status: 200, body: changed },
      { status: 200, body: original },
    ],
  });
  return {
    element: (
      <JourneyWorkspace
        tripId={7}
        journeyId={20}
        client={transport.client}
        documentsClient={documentsClient}
      />
    ),
    client: transport.client,
    documentsClient,
    target: { kind: 'journey', id: 20 },
    label: 'Transport mode',
    initial: original.mode,
    next: 'Edited source',
    writes: () => transport.requests.filter((request) => request.method !== 'GET'),
  };
}
