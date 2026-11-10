import type { Client as DocumentsClient } from '../documents-api/client';
import type { Client } from '../trips-api/client';
import type {
  PlacesListResponses,
  StaysGetResponses,
  StaysUpdateData,
  TripsGetResponses,
  VisitsListResponses,
} from '../trips-api/types.gen';

/** Source stay shape generated from the Trips producer contract. */
export type Stay = StaysGetResponses[200];
/** Explicit partial mutation; supplied timing and reference arrays replace complete values. */
export type StayPatch = NonNullable<StaysUpdateData['body']>;
/** Visit source records, whose dates never fill stay fields. */
export type Visit = VisitsListResponses[200]['visits'][number];
/** Reusable manually captured place identity. */
export type Place = PlacesListResponses[200]['places'][number];
/** Trip source metadata. */
export type Trip = TripsGetResponses[200];
/** Workspace identity and optional generated-client override for an explicit host/transport. */
export interface StayWorkspaceProps {
  tripId: number;
  stayId: number;
  client?: Client;
  /** Authenticated Documents owner transport, independent of the Trips source client. */
  documentsClient?: DocumentsClient;
}

/** Explicit field edits and persistence actions shared by source-field sections. */
export interface StayFieldProps {
  stay: Stay;
  edit: (patch: StayPatch) => void;
  commit: (patch: StayPatch) => void;
}
