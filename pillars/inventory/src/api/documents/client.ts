/**
 * Live documents-pillar client for the inventory backend.
 *
 * Inventory holds no local paperless-ngx client of its own — the paperless
 * integration moved to the `documents` bridge pillar (ADR-035 bridge kind,
 * ADR-039 workstream 13). Inventory's `paperless.*` REST contract
 * (`pillars/inventory/src/contract/rest-paperless.ts`) is unchanged so its
 * frontend keeps working without a rebuild; only the backing implementation
 * moved, from an embedded `PaperlessClient` to this `pillar('documents')`
 * proxy call at request time.
 *
 * All reads degrade gracefully: when `documents` is unreachable, degraded, or
 * its contract mismatches, the SDK returns a `CallResult` whose `kind !==
 * 'ok'` and the client substitutes the same conservative shape the wire
 * contract already models for "not configured" — no new error states reach
 * inventory's frontend.
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/client';

/** The documents pillar id, as registered with the registry. */
export const DOCUMENTS_PILLAR_ID = 'documents';

/** Mirrors the `paperless.status` response `data` shape. */
export interface PaperlessStatus {
  configured: boolean;
  available: boolean;
  baseUrl: string | null;
}

/** Mirrors one entry of the `paperless.search` response `data` array. */
export interface PaperlessSearchDocument {
  id: number;
  title: string;
  created: string;
  originalFileName: string;
  thumbnailUrl: string;
}

/**
 * Typed handle over the subset of the documents pillar router inventory
 * calls. Declared as a `type` (not `interface`) so it satisfies the SDK
 * proxy's `Record<string, unknown>` constraint — mirrors the same note on
 * finance's `ContactsRouter` (`pillars/finance/src/api/contacts/client.ts`).
 */
export type DocumentsRouter = {
  paperless: {
    status: () => Promise<{ data: PaperlessStatus }>;
    search: (input: { query: string }) => Promise<{ data: PaperlessSearchDocument[] }>;
  };
};

export interface DocumentsClient {
  /**
   * Whether paperless-ngx is configured + reachable, per the documents
   * pillar. Degrades to `{ configured: false, available: false, baseUrl:
   * null }` when `documents` itself is unreachable — a conservative "assume
   * not usable" rather than claiming knowledge inventory doesn't have.
   */
  getPaperlessStatus(): Promise<PaperlessStatus>;
  /**
   * Search paperless-ngx documents via the documents pillar. Returns `null`
   * when the search could not be served — either `documents` reports the
   * integration is unconfigured (wire 412, which the SDK maps to
   * `kind: 'unavailable'` like any other non-2xx it doesn't special-case) or
   * `documents` itself is unreachable. The caller maps `null` to the same
   * 412 the pre-move embedded-client path returned for "not configured".
   */
  searchPaperlessDocuments(query: string): Promise<PaperlessSearchDocument[] | null>;
}

function warnDegraded(operation: string, result: CallResult<unknown>): void {
  if (isOk(result)) return;
  console.warn(
    `[documents] ${operation} degraded (kind=${result.kind}); treating paperless as unconfigured`
  );
}

/**
 * Build the default documents client over the pillar SDK. `handleFactory` is
 * injectable purely so unit tests can supply a stub router; production
 * passes the real `pillar('documents')`.
 */
export function createDocumentsClient(
  handleFactory: () => PillarHandle<DocumentsRouter> = () =>
    pillar<DocumentsRouter>(DOCUMENTS_PILLAR_ID)
): DocumentsClient {
  return {
    async getPaperlessStatus(): Promise<PaperlessStatus> {
      const result = await handleFactory().paperless.status();
      if (!isOk(result)) {
        warnDegraded('paperless.status', result);
        return { configured: false, available: false, baseUrl: null };
      }
      return result.value.data;
    },

    async searchPaperlessDocuments(query: string): Promise<PaperlessSearchDocument[] | null> {
      const result = await handleFactory().paperless.search({ query });
      if (!isOk(result)) {
        warnDegraded('paperless.search', result);
        return null;
      }
      return result.value.data;
    },
  };
}
