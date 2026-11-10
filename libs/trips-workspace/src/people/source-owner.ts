import { ApiError } from '@pops/pillar-sdk/client';

import { currentSourceOwner } from '../arrangements/source-owner';

import type { SourceOwner } from '../arrangements/source-owner';

/** Reject dispatch or adoption when a captured semantic owner's transport has changed origin. */
export function assertPeopleOwner(owner: SourceOwner): void {
  if (!currentSourceOwner(owner, owner))
    throw new ApiError('The owning source changed', undefined, 'trips.people.source_changed');
}

/** Read only within the captured owner, including across asynchronous transport completion. */
export async function readPeopleSource<T>(owner: SourceOwner, read: () => Promise<T>): Promise<T> {
  assertPeopleOwner(owner);
  const result = await read();
  assertPeopleOwner(owner);
  return result;
}
