import { z } from 'zod';

import { isOk, pillar } from '@pops/pillar-sdk/server';

import { TripsServiceError } from '../../db/services/source-record.js';
import { isKnownSharedTag, replaceSharedTagIds } from '../../db/services/trip-associations.js';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { TripInput } from '../../contract/schemas.js';
import type { TripsDb } from '../../db/index.js';

const IdentitySnapshot = z.object({ tags: z.array(z.object({ id: z.string().uuid() })) });
type TagsRouter = {
  tags: { list: (input: { includeArchived: 'true' }) => Promise<CallResult<unknown>> };
};

/** Read published tag identities through authenticated discovery; failure never replaces the cache. */
export async function fetchSharedTagIds(
  readSnapshot: () => Promise<CallResult<unknown>> = () =>
    pillar<TagsRouter>('tags').tags.list({ includeArchived: 'true' })
): Promise<readonly string[] | undefined> {
  try {
    const result = await readSnapshot();
    if (!isOk(result)) return undefined;
    const snapshot = IdentitySnapshot.safeParse(result.value);
    return snapshot.success ? snapshot.data.tags.map((tag) => tag.id) : undefined;
  } catch {
    return undefined;
  }
}

/** Refresh on an unknown explicit selection only; blank and cached references work without Tags. */
export async function prepareTripTag(
  db: TripsDb,
  input: TripInput,
  fetchIds: () => Promise<readonly string[] | undefined> = fetchSharedTagIds
): Promise<void> {
  if (!input.tagId || isKnownSharedTag(db, input.tagId)) return;
  const ids = await fetchIds();
  if (ids === undefined) throw new TripsServiceError('tags_unavailable');
  replaceSharedTagIds(db, ids);
  if (!isKnownSharedTag(db, input.tagId)) throw new TripsServiceError('tag_unknown');
}
