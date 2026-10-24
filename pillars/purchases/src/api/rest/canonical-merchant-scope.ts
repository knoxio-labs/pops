import { resolveStoredMerchants } from '../contacts/canonical.js';
import { purchaseErrorBody } from '../errors.js';

import type { ErrorBody } from '@pops/types';

import type { PurchaseScopeFilter, PurchasesDb } from '../../db/index.js';
import type { CanonicalMerchants } from '../../db/services/canonical-merchants.js';
import type { CanonicalMerchantResolver } from '../contacts/canonical.js';

/** Resolve every historical merchant before identity-sensitive reads; outages never become raw-id comparisons. */
export async function canonicalMerchantScope(
  db: PurchasesDb,
  scope: PurchaseScopeFilter,
  resolve: CanonicalMerchantResolver
): Promise<
  | {
      readonly ok: true;
      readonly scope: PurchaseScopeFilter & { canonicalMerchants: CanonicalMerchants };
    }
  | { readonly ok: false; readonly response: { status: 503; body: ErrorBody } }
> {
  try {
    const canonicalMerchants = await resolveStoredMerchants(
      db,
      resolve,
      scope.merchant?.resolution === 'entity' ? [scope.merchant.entityId] : []
    );
    return { ok: true as const, scope: { ...scope, canonicalMerchants } };
  } catch {
    return {
      ok: false as const,
      response: { status: 503 as const, body: purchaseErrorBody('contacts_unavailable') },
    };
  }
}
