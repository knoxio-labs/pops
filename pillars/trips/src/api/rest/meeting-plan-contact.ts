import { MeetingContactUriSchema } from '../../contract/meeting-plan-schemas.js';
import { getMeetingPlan, requireMeetingRevision } from '../../db/services/meeting-plan-queries.js';
import { TripsServiceError } from '../../db/services/source-record.js';
import { resolveContactReference } from './contact-reference.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { MeetingPlanOperation } from '../../contract/meeting-plan-schemas.js';
import type { TripsDb } from '../../db/index.js';
import type { ContactReferenceResolver } from './contact-reference.js';

/** Owning Contacts reference result; undefined means unavailable, null means unknown identity. */
export type MeetingContactResolver = ContactReferenceResolver;
/** Resolve only the published Contact identity route, including historical aliases, through authenticated discovery. */
export async function resolveMeetingContact(
  uri: string,
  read?: (id: string) => Promise<CallResult<unknown>>
): Promise<string | null | undefined> {
  MeetingContactUriSchema.parse(uri);
  const canonical = await resolveContactReference(uri, read);
  if (canonical === null || canonical === undefined) return canonical;
  const parsed = MeetingContactUriSchema.safeParse(canonical);
  return parsed.success ? parsed.data : undefined;
}
function newContactReference(
  db: TripsDb,
  tripId: number,
  operation: MeetingPlanOperation
): string | undefined {
  const command = operation.command;
  if (command.kind === 'undo') return undefined;
  if (command.kind === 'create') return command.input.contactUri;
  const before = getMeetingPlan(db, tripId, command.id);
  requireMeetingRevision(before, command.expectedRevision);
  if (command.kind === 'remove') return undefined;
  const uri = command.patch.contactUri;
  return uri === null || uri === before.contactUri ? undefined : uri;
}
/** Verify only new or changed nonnull references; retained missing identities and clear operations need no Contact read. */
export async function prepareMeetingContact(
  db: TripsDb,
  tripId: number,
  operation: MeetingPlanOperation,
  resolve: MeetingContactResolver = resolveMeetingContact
): Promise<string | undefined> {
  const uri = newContactReference(db, tripId, operation);
  if (uri === undefined) return undefined;
  let canonical: string | null | undefined;
  try {
    canonical = await resolve(uri);
  } catch {
    throw new TripsServiceError('meeting_contact_unavailable');
  }
  if (canonical === undefined) throw new TripsServiceError('meeting_contact_unavailable');
  if (canonical === null) throw new TripsServiceError('meeting_contact_unknown');
  const parsed = MeetingContactUriSchema.safeParse(canonical);
  if (!parsed.success) throw new TripsServiceError('meeting_contact_unavailable');
  return parsed.data;
}
