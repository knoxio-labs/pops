import { z } from 'zod';

import { isOk, pillar } from '@pops/pillar-sdk/server';

import { MeetingContactUriSchema } from '../../contract/meeting-plan-schemas.js';
import { getMeetingPlan, requireMeetingRevision } from '../../db/services/meeting-plan-queries.js';
import { TripsServiceError } from '../../db/services/source-record.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { MeetingPlanOperation } from '../../contract/meeting-plan-schemas.js';
import type { TripsDb } from '../../db/index.js';

const Reference = z.object({ canonicalId: z.string().min(1), uri: MeetingContactUriSchema });
type ContactsRouter = {
  entities: { reference: (input: { id: string }) => Promise<CallResult<unknown>> };
};
/** Owning Contacts reference result; undefined means unavailable, null means unknown identity. */
export type MeetingContactResolver = (uri: string) => Promise<string | null | undefined>;
/** Resolve only the published Contact identity route, including historical aliases, through authenticated discovery. */
export async function resolveMeetingContact(
  uri: string,
  read: (id: string) => Promise<CallResult<unknown>> = (id) =>
    pillar<ContactsRouter>('contacts').entities.reference({ id })
): Promise<string | null | undefined> {
  const parsed = MeetingContactUriSchema.parse(uri);
  try {
    const result = await read(parsed.slice('pops:contacts/contact/'.length));
    if (!isOk(result)) return result.kind === 'not-found' ? null : undefined;
    const reference = Reference.safeParse(result.value);
    return reference.success ? reference.data.uri : undefined;
  } catch {
    return undefined;
  }
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
