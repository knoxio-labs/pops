/**
 * The documents-pillar calls behind item document uploads: the raw upload
 * and download byte legs, the consumption-task lookup that resolves a
 * pending ingestion, and the title sync a link edit makes.
 *
 * Kept apart from the read-only `DocumentsClient` in `client.ts`, which
 * degrades every failure to "not configured". These callers need the
 * failure itself: an unknown task fails an ingestion while an unreachable
 * documents pillar must leave it pending, and an upload refusal (413, 415,
 * 412) is passed back to the uploader as documents worded it.
 *
 * Like `client.ts`, every call goes out without a credential (the
 * unauthenticated `@pops/pillar-sdk/client` proxy and a discovered base URL
 * for the byte legs), relying on the docker network perimeter. See the
 * documents README's "Authentication" section.
 */
import {
  isOk,
  pillar,
  type CallFailure,
  type CallResult,
  type PillarHandle,
} from '@pops/pillar-sdk/client';
import { lookupPillar as defaultLookupPillar } from '@pops/pillar-sdk/discovery';

// Declared here rather than imported from `client.ts`: the cross-pillar
// expectations guard resolves a `pillar()` producer only from a module-level
// const in the calling file.
const DOCUMENTS_PILLAR_ID = 'documents';

/** Mirrors documents' `PaperlessTaskStatusSchema`. */
export interface PaperlessTaskStatus {
  state: 'pending' | 'done' | 'duplicate' | 'failed';
  documentId: number | null;
  reason: string | null;
}

/**
 * The documents router subset this client calls. A `type`, not an
 * `interface`, so it satisfies the SDK proxy's `Record<string, unknown>`
 * constraint.
 */
export type DocumentsUploadsRouter = {
  paperless: {
    status: () => Promise<{ data: { maxUploadBytes: number } }>;
    task: (input: { taskId: string }) => Promise<{ data: PaperlessTaskStatus }>;
  };
  write: {
    update: (input: { id: number; title: string }) => Promise<{ data: unknown }>;
  };
};

/**
 * Where a consumption task stands as far as inventory can tell. `unknown`
 * is documents answering 404 (Paperless has no such task); `unreachable` is
 * every other failure, none of which says anything about the task.
 */
export type TaskLookup =
  | { kind: 'resolved'; status: PaperlessTaskStatus }
  | { kind: 'unknown' }
  | { kind: 'unreachable' };

/** The outcome of a Paperless title change. */
export type TitleUpdate = { ok: true } | { ok: false; failure: CallFailure };

/** What the upload leg forwards beside the body. */
export interface UploadRequest {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  /** The caller's declared length, forwarded so documents can refuse an oversize file unread. */
  contentLength: string | undefined;
  fileName: string;
  title: string | undefined;
}

/** The documents pillar could not be discovered or reached at all. */
export class DocumentsUnreachableError extends Error {
  override readonly name = 'DocumentsUnreachableError' as const;

  constructor(operation: string, cause: unknown) {
    super(`The documents pillar could not be reached for ${operation}`, { cause });
  }
}

/** The documents-pillar operations item document uploads depend on. */
export interface DocumentUploadsClient {
  /** Look up a consumption task. Never throws. */
  taskStatus(taskId: string): Promise<TaskLookup>;
  /** The upload cap documents enforces, or `null` when documents cannot say. Never throws. */
  maxUploadBytes(): Promise<number | null>;
  /** Set a Paperless document's title. Never throws. */
  updateTitle(paperlessDocumentId: number, title: string): Promise<TitleUpdate>;
  /**
   * Stream an upload to `POST /paperless/documents` and return documents'
   * response unread. Throws {@link DocumentsUnreachableError} when no
   * response arrives.
   */
  upload(request: UploadRequest): Promise<Response>;
  /**
   * Request `GET /paperless/documents/:id/download`, forwarding `range`, and
   * return the response with its body unread. Throws
   * {@link DocumentsUnreachableError} when no response arrives.
   */
  download(paperlessDocumentId: number, range: string | undefined): Promise<Response>;
}

/** Injection points for tests; production passes none. */
export interface DocumentUploadsClientOptions {
  handleFactory?: () => PillarHandle<DocumentsUploadsRouter>;
  lookupDocumentsPillar?: typeof defaultLookupPillar;
  fetchImpl?: typeof fetch;
}

/** Long enough for a large file over the LAN; the documents leg to Paperless has its own. */
const TRANSFER_TIMEOUT_MS = 10 * 60_000;

async function settle<T>(call: () => Promise<CallResult<T>>): Promise<CallResult<T>> {
  try {
    return await call();
  } catch {
    return { kind: 'unavailable', pillar: DOCUMENTS_PILLAR_ID };
  }
}

async function documentsBaseUrl(
  lookup: typeof defaultLookupPillar,
  operation: string
): Promise<string> {
  let found: Awaited<ReturnType<typeof defaultLookupPillar>>;
  try {
    found = await lookup(DOCUMENTS_PILLAR_ID);
  } catch (err) {
    throw new DocumentsUnreachableError(operation, err);
  }
  if (!found) throw new DocumentsUnreachableError(operation, 'not registered');
  return found.baseUrl.replace(/\/$/, '');
}

async function send(
  fetchImpl: typeof fetch,
  operation: string,
  url: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TRANSFER_TIMEOUT_MS) });
  } catch (err) {
    throw new DocumentsUnreachableError(operation, err);
  }
}

/** Build the client over the pillar SDK and discovery. */
export function createDocumentUploadsClient(
  options: DocumentUploadsClientOptions = {}
): DocumentUploadsClient {
  const handle =
    options.handleFactory ?? (() => pillar<DocumentsUploadsRouter>(DOCUMENTS_PILLAR_ID));
  const lookup = options.lookupDocumentsPillar ?? defaultLookupPillar;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async taskStatus(taskId) {
      const result = await settle(() => handle().paperless.task({ taskId }));
      if (isOk(result)) return { kind: 'resolved', status: result.value.data };
      if (result.kind === 'not-found') return { kind: 'unknown' };
      console.warn(`[documents] paperless.task unresolved (kind=${result.kind}); left pending`);
      return { kind: 'unreachable' };
    },

    async maxUploadBytes() {
      const result = await settle(() => handle().paperless.status());
      return isOk(result) ? result.value.data.maxUploadBytes : null;
    },

    async updateTitle(paperlessDocumentId, title) {
      const result = await settle(() => handle().write.update({ id: paperlessDocumentId, title }));
      return isOk(result) ? { ok: true } : { ok: false, failure: result };
    },

    async upload(request) {
      const baseUrl = await documentsBaseUrl(lookup, 'upload');
      const query = new URLSearchParams({ fileName: request.fileName });
      if (request.title !== undefined) query.set('title', request.title);
      const headers: Record<string, string> = {
        'Content-Type': request.contentType,
        Accept: 'application/json',
      };
      if (request.contentLength !== undefined) headers['Content-Length'] = request.contentLength;
      return send(fetchImpl, 'upload', `${baseUrl}/paperless/documents?${query.toString()}`, {
        method: 'POST',
        headers,
        body: request.body,
        duplex: 'half',
      });
    },

    async download(paperlessDocumentId, range) {
      const baseUrl = await documentsBaseUrl(lookup, 'download');
      return send(
        fetchImpl,
        'download',
        `${baseUrl}/paperless/documents/${String(paperlessDocumentId)}/download`,
        { headers: range === undefined ? {} : { Range: range } }
      );
    },
  };
}
