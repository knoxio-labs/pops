/**
 * Types for the live contacts-pillar client (`./client.js`) — split out
 * purely to keep `client.ts` under the repo's per-file line budget; these
 * carry no logic of their own; see `client.ts`'s own doc comment for the
 * degradation/error-classification model they support.
 *
 * `CONTACTS_PILLAR_ID` and `ContactsRouter` stay declared in `client.ts`
 * itself rather than here: the cross-pillar-expectations guard (ADR-045)
 * resolves a `pillar<T>(id)` call site's producer from a local `const id
 * = '...'` and its operations from `T`'s declaration, both read from that
 * SAME file — moving either out of `client.ts` would make the call site
 * unresolvable.
 */
/** A full contact, mirroring the contacts `Entity` wire shape (no notion/owner columns). */
export interface ContactEntity {
  id: string;
  name: string;
  type: string;
  abn: string | null;
  aliases: string[];
  defaultTransactionType: string | null;
  defaultTags: string[];
  notes: string | null;
  lastEditedTime: string;
  avatarAssetId: string | null;
  colour: string | null;
}

/** The subset of a contact the account-issuer display resolver needs. */
export interface ContactEntitySummary {
  name: string;
  colour: string | null;
  avatarAssetId: string | null;
}

/** The contacts `entities.list` envelope (page of contacts + pagination cursor). */
export interface ListResponse {
  data: ContactEntity[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

/** Outcome of a create-or-fetch-by-name pre-create against contacts. */
export interface CreateOrFetchResult {
  id: string;
  name: string;
  /** True only when this call inserted a NEW contact; false when it reused an existing one. */
  created: boolean;
}

/**
 * The injectable seam every finance live-fetch path depends on. The default
 * impl is backed by `pillar('contacts')`; tests pass a fake so the matcher /
 * usage join / degradation paths are exercised without the network.
 */
export interface ContactsClient {
  /**
   * The whole contact set (optionally filtered by `search`/`type`), paged out
   * of the contacts list endpoint. Empty when contacts is down.
   */
  fetchAllEntities(query?: { search?: string; type?: string }): Promise<ContactEntity[]>;
  /**
   * The `defaultTags` of a single contact (the tag-suggester entity source for
   * the per-transaction suggest endpoint). Empty when the id is unknown or
   * contacts is down — the entity stage simply contributes nothing.
   */
  fetchEntityDefaultTags(entityId: string): Promise<string[]>;
  /**
   * A single contact's display name, for the accounts read side (`person`
   * accounts, POPS-2771). `null` when contacts is down or the id is unknown
   * — the caller degrades to the account's own stored `name` with a stale
   * marker rather than treating this as an error.
   */
  fetchEntityDisplayName(entityId: string): Promise<string | null>;
  /**
   * A single contact's name/colour/avatar, for the account-issuer display
   * resolver (POPS-3063) — a bank-typed contact's `colour`/`avatarAssetId`
   * alongside its name, in one call rather than three. `null` under the same
   * conditions as {@link fetchEntityDisplayName}.
   */
  fetchEntitySummary(entityId: string): Promise<ContactEntitySummary | null>;
  /**
   * Resolve a contact for `name`, creating it only when absent. Fetches by
   * (case-insensitive) name FIRST, creates when none matches, and tolerates a
   * 409 from a racing concurrent create by re-fetching. `created` reports
   * whether THIS call inserted a new contact. Never resolves silently on
   * failure: a TRANSIENT failure (contacts unreachable / mid-recovery /
   * rate-limited) throws {@link ContactsUnavailableError}; a PERMANENT one
   * (malformed request, auth, contract mismatch, an unrecognised refusal)
   * throws {@link ContactsPermanentError}. `commitImport`
   * (issue #3683) is the one caller that catches `ContactsUnavailableError`
   * specifically and degrades to a `pending:contact:{uuid}` placeholder + an
   * outbox row instead of aborting; `ContactsPermanentError` and every other
   * caller still let the failure propagate and abort.
   */
  createOrFetchByName(name: string, type: string): Promise<CreateOrFetchResult>;
  /**
   * Replace a contact's `defaultTags` wholesale (contacts `PATCH /entities/:id`
   * takes the full array; there is no per-tag verb). Backs the reviewed
   * `venue:` default backfill (POPS-2609) and sits on no request path — it is
   * the ONE write finance makes to a contact's attributes, so it never degrades
   * silently: a failure throws the same TRANSIENT/PERMANENT split
   * `createOrFetchByName` uses and the caller decides whether to stop.
   */
  updateDefaultTags(entityId: string, defaultTags: string[]): Promise<ContactEntity>;
}
