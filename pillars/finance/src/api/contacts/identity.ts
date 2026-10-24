import { resolveCanonicalIds, type PillarHandle } from '@pops/pillar-sdk/server';

import { DependencyUnavailableError } from '../shared/errors.js';

/** Finance's read-only identity-resolution operation over the contacts federation contract. */
export type ContactsIdentityRouter = {
  entities: {
    resolve: (input: { ids: string[] }) => Promise<{
      data: { id: string; canonicalId: string | null }[];
      revision: number;
    }>;
  };
};

/** Resolve a complete revision-consistent mapping, surfacing unavailable or malformed reads as 503. */
export async function resolveContactIdentities(
  handle: PillarHandle<ContactsIdentityRouter> | null,
  ids: readonly string[]
): Promise<ReadonlyMap<string, string | null>> {
  if (ids.length === 0) return new Map();
  if (handle === null) throw new DependencyUnavailableError('Contact identities are unavailable');
  try {
    return await resolveCanonicalIds(ids, (batch) => handle.entities.resolve({ ids: batch }));
  } catch {
    throw new DependencyUnavailableError('Contact identities are unavailable');
  }
}
