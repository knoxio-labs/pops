import type { ContactsHostCapability } from '@pops/pillar-sdk';

import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client } from '../trips-api/client';
import type { EventsGetResponses, EventsUpdateData } from '../trips-api/types.gen';

/** Persisted event source shape generated from the owning Trips contract. */
export type TripEvent = EventsGetResponses[200];
/** Explicit partial edit; timing and reference arrays replace complete values. */
export type EventPatch = NonNullable<EventsUpdateData['body']>;
/** Source identities and optional authenticated generated-client transport. */
export interface EventWorkspaceProps {
  tripId: number;
  eventId: number;
  client?: Client;
  /** Owner chooser and retained-reference reader supplied through the host boundary. */
  contacts?: ContactsHostCapability;
  /** Authenticated Documents owner transport, independent of the Trips source client. */
  documentsClient?: DocumentsClient;
}
/** Controlled source fields and their explicit persistence action. */
export interface EventFieldProps {
  event: TripEvent;
  edit: (patch: EventPatch) => void;
  commit: (patch: EventPatch) => void;
}
