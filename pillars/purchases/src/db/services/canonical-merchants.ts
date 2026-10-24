import { purchaseProductAliases, purchases } from '../schema.js';
import { tupleKey } from './tuple-key.js';

import type { PurchasesDb } from './internal.js';

/** Contacts' complete identity snapshot; null explicitly records a missing historical entity. */
export type CanonicalMerchants = ReadonlyMap<string, string | null>;

/** Canonical identity, retaining an explicitly missing historical id as its own isolated bucket. */
export function canonicalMerchantId(
  id: string | null,
  identities?: CanonicalMerchants
): string | null {
  if (id === null || identities === undefined) return id;
  if (!identities.has(id)) throw new Error('Merchant identity snapshot does not cover this read');
  return identities.get(id) ?? id;
}

function scopeParts(scopeKey: string): { source: string; id: string } | undefined {
  const scope: unknown = JSON.parse(scopeKey);
  if (
    !Array.isArray(scope) ||
    scope.length !== 2 ||
    typeof scope[0] !== 'string' ||
    typeof scope[1] !== 'string'
  )
    return undefined;
  const merchant: unknown = JSON.parse(scope[1]);
  if (
    !Array.isArray(merchant) ||
    merchant.length !== 2 ||
    merchant[0] !== 'entity' ||
    typeof merchant[1] !== 'string'
  )
    return undefined;
  return { source: scope[0], id: merchant[1] };
}

/** Compare historical dictionary scopes through the current identity snapshot without rewriting them. */
export function canonicalProductScope(scopeKey: string, identities?: CanonicalMerchants): string {
  if (identities === undefined) return scopeKey;
  const parts = scopeParts(scopeKey);
  return parts === undefined
    ? scopeKey
    : tupleKey(parts.source, tupleKey('entity', canonicalMerchantId(parts.id, identities)));
}

/** Every merchant referenced by orders or durable dictionary assertions, plus an optional filter target. */
export function storedMerchantIds(
  db: PurchasesDb,
  extra: readonly string[] = []
): readonly string[] {
  const ids = new Set(extra);
  for (const row of db.select({ id: purchases.merchantEntityId }).from(purchases).all()) {
    if (row.id !== null) ids.add(row.id);
  }
  for (const row of db
    .select({ scopeKey: purchaseProductAliases.scopeKey })
    .from(purchaseProductAliases)
    .all()) {
    const parts = scopeParts(row.scopeKey);
    if (parts !== undefined) ids.add(parts.id);
  }
  return [...ids];
}
