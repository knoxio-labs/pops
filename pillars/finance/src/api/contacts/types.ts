/**
 * Wire/router shapes for the contacts client — split out of `client.ts` so
 * that file stays under the repo's per-file line budget. Re-exported from
 * `client.ts`, so every existing `import { ContactEntity } from './client.js'`
 * (or `'../contacts/client.js'`) keeps working unchanged.
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

/** The contacts `entities.list` envelope (page of contacts + pagination cursor). */
export interface ListResponse {
  data: ContactEntity[];
  pagination: { total: number; limit: number; offset: number; hasMore: boolean };
}

/**
 * Typed handle over the subset of the contacts router the finance backend
 * calls. Declared as a `type` (not `interface`) so it satisfies the SDK proxy's
 * `Record<string, unknown>` constraint — an interface does not (see the same
 * note in the orchestrator's `PillarSearchRouter`). Exported for unit tests
 * that drive `createContactsClient` against a stub handle.
 */
export type ContactsRouter = {
  entities: {
    list: (input: {
      search?: string;
      type?: string;
      limit?: number;
      offset?: number;
    }) => Promise<ListResponse>;
    get: (input: { id: string }) => Promise<{ data: ContactEntity }>;
    create: (input: {
      name: string;
      type: string;
    }) => Promise<{ data: ContactEntity; message: string }>;
    update: (input: {
      id: string;
      defaultTags: string[];
    }) => Promise<{ data: ContactEntity; message: string }>;
  };
};

/** Outcome of a create-or-fetch-by-name pre-create against contacts. */
export interface CreateOrFetchResult {
  id: string;
  name: string;
  /** True only when this call inserted a NEW contact; false when it reused an existing one. */
  created: boolean;
}
