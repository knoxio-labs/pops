import { pillar, resolveCanonicalIds } from '@pops/pillar-sdk/server';

import {
  storedMerchantIds,
  type CanonicalMerchants,
} from '../../db/services/canonical-merchants.js';
import { credentialled } from '../pillars/outbound.js';

import type { PurchasesDb } from '../../db/index.js';

type ContactsIdentityRouter = {
  entities: {
    resolve: (input: {
      ids: string[];
    }) => Promise<{ data: { id: string; canonicalId: string | null }[]; revision: number }>;
  };
};

/** Resolves historical merchant ids; failure rejects rather than claiming that identities differ. */
export type CanonicalMerchantResolver = (ids: readonly string[]) => Promise<CanonicalMerchants>;

/** Authenticated Contacts lookup with validated batching and no stale or raw-id fallback. */
export const resolveMerchantIdentities: CanonicalMerchantResolver = async (ids) => {
  if (ids.length === 0) return new Map();
  const contacts = credentialled('contacts', () => pillar<ContactsIdentityRouter>('contacts'));
  if (contacts === null) throw new Error('Contacts identity resolution has no credential');
  return resolveCanonicalIds(ids, (batch) => contacts.entities.resolve({ ids: batch }));
};

/** Resolve a complete snapshot outside SQLite transactions, including historical dictionary scopes. */
export function resolveStoredMerchants(
  db: PurchasesDb,
  resolve: CanonicalMerchantResolver = resolveMerchantIdentities,
  extra: readonly string[] = []
): Promise<CanonicalMerchants> {
  return resolve(storedMerchantIds(db, extra));
}
