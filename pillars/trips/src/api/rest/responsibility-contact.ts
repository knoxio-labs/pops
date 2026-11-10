import { ContactUriSchema } from '../../contract/contact-reference.js';
import { requireArrangementRevision } from '../../db/services/arrangement-revision.js';
import { getResponsibility } from '../../db/services/responsibilities.js';
import { TripsServiceError } from '../../db/services/source-record.js';
import { resolveContactReference } from './contact-reference.js';

import type { ArrangementResponsibility, Responsibility } from '../../contract/responsibilities.js';
import type { TripsDb } from '../../db/index.js';
import type { ContactReferenceResolver } from './contact-reference.js';

/** Verify only a new or changed Contact selection; the write must recheck revision and ownership after awaiting. */
export async function prepareResponsibilityContact(
  db: TripsDb,
  target: Pick<ArrangementResponsibility, 'tripId' | 'targetKind' | 'targetId'>,
  input: { expectedRevision: number; responsibility: Responsibility },
  resolve: ContactReferenceResolver = resolveContactReference
): Promise<Responsibility> {
  const current = getResponsibility(db, target.tripId, target.targetKind, target.targetId);
  requireArrangementRevision(current.revision, input.expectedRevision);
  const selected = input.responsibility;
  if (
    selected?.kind !== 'contact' ||
    (current.responsibility?.kind === 'contact' && selected.uri === current.responsibility.uri)
  )
    return selected;
  let canonical: string | null | undefined;
  try {
    canonical = await resolve(selected.uri);
  } catch {
    throw new TripsServiceError('contacts_unavailable');
  }
  if (canonical === null) throw new TripsServiceError('contact_unknown');
  const parsed = ContactUriSchema.safeParse(canonical);
  if (!parsed.success) throw new TripsServiceError('contacts_unavailable');
  return { kind: 'contact', uri: parsed.data };
}
