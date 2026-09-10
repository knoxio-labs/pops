/**
 * The contacts pillar's read side, and the classification every write shares.
 *
 * Split out of `client.ts`, which had eight lines of headroom against the
 * repo's 200-line cap (POPS-3113). Everything here is below the client's
 * public surface: paging a list sweep, fetching one contact, deciding whether
 * a failed call is worth retrying, and saying so in the log. `client.ts` keeps
 * the `ContactsClient` factory and the write leg.
 *
 * Nothing here imports `client.ts`, in either direction — not even as a type.
 * `ContactsRouter` has to stay declared in the file that calls `pillar<T>()`,
 * because the cross-pillar-expectations guard resolves that call site's
 * operations from `T`'s declaration in the SAME file (ADR-045); importing it
 * back for these signatures is a module cycle `depcruise` refuses, type-only
 * or not. So the two operations this module calls are restated below as
 * {@link ContactsReadRouter}, and the compiler holds the two in agreement:
 * `client.ts` passes its own handle into every function here, so a signature
 * that drifts from `ContactsRouter` fails to build. `CONTACTS_PILLAR_ID` is
 * declared here and re-exported there for the same reason.
 */
import { isOk, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import { credentialRejectedMessage, UNAUTHORIZED_REASON } from '../pillars/outbound.js';

import type { ContactEntity, ListResponse } from './types.js';

/** The contacts pillar id, as registered with the registry. */
export const CONTACTS_PILLAR_ID = 'contacts';

/**
 * The two operations this module calls, as a router of their own.
 *
 * A narrower `ContactsRouter`: `client.ts`'s handle carries `create` and
 * `update` as well and is assignable to this one, so callers pass theirs
 * unchanged.
 */
export type ContactsReadRouter = {
  entities: {
    list: (input: {
      search?: string;
      type?: string;
      limit?: number;
      offset?: number;
    }) => Promise<ListResponse>;
    get: (input: { id: string }) => Promise<{ data: ContactEntity }>;
  };
};

/** The non-ok, non-conflict result kinds this classifier sorts. */
type ContactsFailureKind = Exclude<CallResult<unknown>['kind'], 'ok' | 'conflict'>;

/**
 * TRANSIENT vs PERMANENT for every non-ok/non-conflict write result kind
 * (`entities.create` and `entities.update` share it).
 *
 * A total switch with no default arm, matching `toGatewayFailure` and
 * `upstream-error.ts`'s `classify`: a kind added to {@link CallResult} that
 * is not listed in one of these two arms fails the build here rather than
 * being silently absorbed by a catch-all negation. `rate-limited` (429) is
 * TRANSIENT — the producer is asking for a retry on its own schedule, not
 * refusing the request — so it degrades to the outbox exactly like
 * `unavailable`/`degraded` rather than aborting the commit.
 */
export function classifyContactsFailureKind(kind: ContactsFailureKind): 'transient' | 'permanent' {
  switch (kind) {
    case 'unavailable':
    case 'degraded':
    case 'rate-limited':
      return 'transient';
    case 'not-found':
    case 'contract-mismatch':
    case 'bad-request':
    case 'unauthorized':
    case 'refused':
      return 'permanent';
  }
}

/** Per-page size for the bulk list sweep — matches the contacts list `MAX_LIMIT`. */
const PAGE_SIZE = 200;
/**
 * Safety cap on the paging sweep: a backstop against a runaway loop on a
 * misbehaving peer, NOT a dataset cap. At `PAGE_SIZE` per page this is 1M
 * contacts — comfortably above any personal dataset. The matcher needs the
 * FULL set, so hitting this cap is treated as a visible truncation (warned),
 * never a silent partial fetch.
 */
export const MAX_PAGES = 5000;

export function warnDegraded(operation: string, result: CallResult<unknown>): void {
  if (isOk(result)) return;
  if (result.kind === UNAUTHORIZED_REASON) {
    console.error(credentialRejectedMessage(CONTACTS_PILLAR_ID, operation));
    return;
  }
  console.warn(
    `[contacts] ${operation} degraded (kind=${result.kind}); substituting empty contact set`
  );
}

/**
 * Fetch a single contact by id, shared by `fetchEntityDefaultTags`,
 * `fetchEntityDisplayName` and `fetchEntitySummary` — all three need the same
 * contact and degrade the same way (`null` for no handle, an unknown id, or a
 * degraded result), differing only in which field(s) of it they read.
 */
export async function fetchOneEntity(
  handle: PillarHandle<ContactsReadRouter> | null,
  entityId: string
): Promise<ContactEntity | null> {
  if (handle === null) return null;
  const result = await handle.entities.get({ id: entityId });
  if (!isOk(result) && result.kind !== 'not-found') warnDegraded('entities.get', result);
  return isOk(result) ? result.value.data : null;
}

export async function pageThroughEntities(
  handle: PillarHandle<ContactsReadRouter> | null,
  query: { search?: string; type?: string },
  maxPages: number
): Promise<ContactEntity[]> {
  // `credentialled()` already logged the no-key case once for this
  // process; nothing else to say here beyond substituting the same empty
  // set a real outage would.
  if (handle === null) return [];
  const all: ContactEntity[] = [];
  for (let page = 0; page < maxPages; page++) {
    const result = await handle.entities.list({
      search: query.search,
      type: query.type,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    });
    if (!isOk(result)) {
      warnDegraded('entities.list', result);
      return [];
    }
    all.push(...result.value.data);
    if (!result.value.pagination.hasMore) return all;
  }
  console.warn(
    `[contacts] entities.list sweep hit the ${maxPages}-page safety cap with more rows ` +
      `still available — returning a TRUNCATED set of ${all.length} contacts; matches/usage ` +
      `for the tail will be missed`
  );
  return all;
}

/**
 * Resolve a single contact by exact (case-insensitive) name. The list `search`
 * is a substring filter, so the exact match is re-checked client-side over the
 * matching page. Backs the fetch-first leg of create-or-fetch, returning the
 * existing contact for reuse before any create is attempted.
 *
 * An alias counts as the entity's name: a descriptor that reads "Maccas" names
 * the contact that answers to it, and creating a second entity for the alias
 * is the duplicate this leg exists to prevent. A name match still wins.
 */
export async function fetchByExactName(
  handle: PillarHandle<ContactsReadRouter>,
  name: string,
  maxPages: number
): Promise<ContactEntity | null> {
  const matches = await pageThroughEntities(handle, { search: name }, maxPages);
  const target = name.toLowerCase();
  return (
    matches.find((e) => e.name.toLowerCase() === target) ??
    matches.find((e) => e.aliases.some((alias) => alias.toLowerCase() === target)) ??
    null
  );
}
