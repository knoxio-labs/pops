/**
 * What the caller behind a request may see of the ledger (POPS-5866, epic
 * POPS-5827).
 *
 * The scope gate decides whether a guest reaches a route at all. This decides
 * which accounts a guest who got through may touch. The operator and a service
 * principal see every account, and so does every caller while classification
 * is off, because the gate resolves nobody to a guest then.
 *
 * An account a guest holds no grant on answers exactly as one that does not
 * exist, so a guest cannot learn which ids are real by probing them.
 */
import { readPrincipal } from '@pops/pillar-express';

import { accountGrantsService, type AccountGrantRole, type FinanceDb } from '../../db/index.js';
import { ForbiddenError, NotFoundError } from '../shared/errors.js';

import type { Response } from 'express';

/** Every account, or the accounts a guest was granted with the role held on each. */
export type AccountAccess = 'all' | ReadonlyMap<string, AccountGrantRole>;

/** How the caller stands towards an account it can see. */
export type ViewerRole = 'owner' | AccountGrantRole;

/**
 * Resolve the request's reach. Reads the grants table on every call, so a
 * change or a revocation applies to the grantee's next request.
 */
export function accountAccess(res: Response, db: FinanceDb): AccountAccess {
  const principal = readPrincipal(res);
  if (principal.kind !== 'guest') return 'all';
  return accountGrantsService.grantsForEmail(db, principal.email);
}

/**
 * Refuse unless the caller holds at least `minimum` on the account.
 *
 * Says nothing about whether the account exists: a caller with full reach
 * passes for any id, and the handler's own lookup answers for a missing one.
 *
 * @throws NotFoundError for an account the caller holds no grant on, worded as
 *   a missing account is.
 * @throws ForbiddenError for a `view` grant where `edit` is needed.
 */
export function requireAccountRole(
  access: AccountAccess,
  accountId: string,
  minimum: AccountGrantRole
): void {
  if (access === 'all') return;
  const role = access.get(accountId);
  if (role === undefined) throw new NotFoundError('Account', accountId);
  if (minimum === 'edit' && role !== 'edit') {
    throw new ForbiddenError(`Account '${accountId}' is shared with you as view only`);
  }
}

/** Whether the caller may see the account at all. */
export function canSeeAccount(access: AccountAccess, accountId: string): boolean {
  return access === 'all' || access.has(accountId);
}

/**
 * The account ids to narrow a query to, or `undefined` for a caller with full
 * reach, which is no narrowing. A guest with no grants yields an empty list,
 * which matches nothing.
 */
export function visibleAccountIds(access: AccountAccess): string[] | undefined {
  return access === 'all' ? undefined : [...access.keys()];
}

/** The caller's standing on an account it can see. */
export function viewerRole(access: AccountAccess, accountId: string): ViewerRole {
  if (access === 'all') return 'owner';
  const role = access.get(accountId);
  if (role === undefined) {
    throw new Error(`viewerRole: account '${accountId}' is not visible to this caller`);
  }
  return role;
}

/**
 * A transaction as a guest may hold it: the import's raw row and its dedup
 * checksum are the operator's bank data, not part of the entry.
 */
export function forGuest<T extends { rawRow: string | null; checksum: string | null }>(
  transaction: T
): T {
  return { ...transaction, rawRow: null, checksum: null };
}

/** The transaction as this caller may hold it: untouched for full reach, {@link forGuest} otherwise. */
export function forViewer<T extends { rawRow: string | null; checksum: string | null }>(
  access: AccountAccess,
  transaction: T
): T {
  return access === 'all' ? transaction : forGuest(transaction);
}
