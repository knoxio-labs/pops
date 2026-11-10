import type { TripCapture } from '../../contract/capture-schemas.js';
import type { TripEvent } from '../../contract/event-schemas.js';
import type { TripIdea } from '../../contract/idea-schemas.js';
import type { Journey } from '../../contract/journey-schemas.js';
import type { CaptureAssociation, ExploreMembership } from '../../contract/source-workspace.js';
import type { Stay } from '../../contract/stay-schemas.js';

/** Per-record preconditions and prior values for a single operation; null means a created identity. */
export type SourceInverse = {
  captures: { after: TripCapture; before: TripCapture | null }[];
  ideas: { after: TripIdea; before: TripIdea | null }[];
  associations: { after: CaptureAssociation; before: CaptureAssociation | null }[];
  memberships: { after: ExploreMembership; before: ExploreMembership | null }[];
  createdEvents: TripEvent[];
  createdJourneys: Journey[];
  createdStays: Stay[];
};
