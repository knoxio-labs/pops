/**
 * Paperless-ngx API HTTP client — typed wrapper around the Paperless-ngx REST API.
 *
 * Handles authentication (Token-based), request construction,
 * response parsing, and error mapping. Contains no business logic.
 *
 * Paperless-ngx API docs: https://docs.paperless-ngx.com/api/
 */
import { ensureOk, paperlessFetch, type PaperlessConnection } from './http.js';
import { multipartUpload, type PaperlessUploadMeta } from './multipart.js';
import { mapPaperlessTask, RawTaskPageSchema, type PaperlessTaskStatus } from './task-state.js';
import {
  PaperlessApiError,
  type PaperlessCorrespondent,
  type PaperlessDocument,
  type PaperlessDocumentPatch,
  type PaperlessDocumentType,
  type PaperlessSearchResult,
  type PaperlessTag,
  type RawPaperlessCorrespondent,
  type RawPaperlessDocument,
  type RawPaperlessDocumentType,
  type RawPaperlessPaginatedResponse,
  type RawPaperlessTag,
} from './types.js';

const READ_TIMEOUT_MS = 5_000;
const THUMBNAIL_TIMEOUT_MS = 10_000;
/** Bytes move through these calls, so they get minutes rather than seconds. */
const TRANSFER_TIMEOUT_MS = 300_000;
/** Paperless 3.2.1's default; pinned so a server-side default change cannot reshape tasks. */
const TASKS_ACCEPT = 'application/json; version=10';

export class PaperlessClient {
  private readonly baseUrl: string;
  private readonly connection: PaperlessConnection;

  constructor(baseUrl: string, token: string) {
    if (!baseUrl) {
      throw new Error('Paperless URL is required');
    }
    if (!token) {
      throw new Error('Paperless token is required');
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.connection = { baseUrl: this.baseUrl, token };
  }

  /** Search documents by query string. */
  async searchDocuments(query: string, page = 1): Promise<PaperlessSearchResult> {
    const params = new URLSearchParams({
      query,
      page: String(page),
    });
    const raw = await this.get<RawPaperlessPaginatedResponse<RawPaperlessDocument>>(
      `/api/documents/?${params.toString()}`
    );
    return {
      documents: raw.results.map((d) => this.mapDocument(d)),
      count: raw.count,
      next: raw.next,
      previous: raw.previous,
    };
  }

  /** Get the total number of documents in Paperless-ngx. */
  async getDocumentCount(): Promise<number> {
    const raw = await this.get<Pick<RawPaperlessPaginatedResponse<never>, 'count'>>(
      '/api/documents/?page_size=1'
    );
    return raw.count;
  }

  /** Get a single document by ID. */
  async getDocument(id: number): Promise<PaperlessDocument> {
    const raw = await this.get<RawPaperlessDocument>(`/api/documents/${id}/`);
    return this.mapDocument(raw);
  }

  /** Get document metadata (custom fields, etc). */
  async getDocumentMetadata(id: number): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/api/documents/${id}/metadata/`);
  }

  /** Build the thumbnail URL for a document. */
  getDocumentThumbnailUrl(id: number): string {
    return `${this.baseUrl}/api/documents/${id}/thumb/`;
  }

  /** Build the download URL for a document. */
  getDocumentDownloadUrl(id: number): string {
    return `${this.baseUrl}/api/documents/${id}/download/`;
  }

  /** Fetch the raw thumbnail image for a document. Returns the response for piping. */
  async fetchThumbnail(id: number): Promise<Response> {
    return paperlessFetch(this.connection, `/api/documents/${id}/thumb/`, {
      timeoutMs: THUMBNAIL_TIMEOUT_MS,
    });
  }

  /**
   * Fetch a document's file for piping, the original upload unless
   * `original` is false. `range` is forwarded as-is; Paperless 3.2.1 serves
   * files through Django's `FileResponse`, which ignores it, so the caller
   * must handle a 200 answering a ranged request.
   */
  async fetchDownload(
    id: number,
    options: { original: boolean; range?: string }
  ): Promise<Response> {
    const headers = new Headers();
    if (options.range !== undefined) headers.set('Range', options.range);
    return paperlessFetch(
      this.connection,
      `/api/documents/${id}/download/?original=${String(options.original)}`,
      { headers, timeoutMs: TRANSFER_TIMEOUT_MS }
    );
  }

  /**
   * Stream `file` to `post_document` and return the consumption task id.
   * Consumption is asynchronous: the id resolves through {@link getTask}.
   */
  async postDocument(file: AsyncIterable<Uint8Array>, meta: PaperlessUploadMeta): Promise<string> {
    const { body, contentType } = multipartUpload(file, meta);
    const response = await paperlessFetch(this.connection, '/api/documents/post_document/', {
      method: 'POST',
      headers: { 'Content-Type': contentType, Accept: 'application/json' },
      body,
      duplex: 'half',
      timeoutMs: TRANSFER_TIMEOUT_MS,
    });
    const taskId: unknown = await (await ensureOk(response)).json();
    if (typeof taskId !== 'string' || taskId === '') {
      throw new PaperlessApiError(response.status, 'post_document returned no task id');
    }
    return taskId;
  }

  /** Resolve a consumption task, or `null` when Paperless has no task with that id. */
  async getTask(taskId: string): Promise<PaperlessTaskStatus | null> {
    const response = await paperlessFetch(
      this.connection,
      `/api/tasks/?${new URLSearchParams({ task_id: taskId }).toString()}`,
      { headers: { Accept: TASKS_ACCEPT }, timeoutMs: READ_TIMEOUT_MS }
    );
    const parsed = RawTaskPageSchema.safeParse(await (await ensureOk(response)).json());
    if (!parsed.success) {
      throw new PaperlessApiError(response.status, 'Unrecognised Paperless task shape');
    }
    const [task] = parsed.data.results.filter((candidate) => candidate.task_id === taskId);
    return task === undefined ? null : mapPaperlessTask(task);
  }

  /** Change the given fields of a document; absent keys are not sent. */
  async updateDocument(id: number, patch: PaperlessDocumentPatch): Promise<PaperlessDocument> {
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined)
    );
    const raw = await this.requestJson<RawPaperlessDocument>(`/api/documents/${id}/`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    return this.mapDocument(raw);
  }

  /** Delete a document. Paperless moves it to its trash, from which it can be restored. */
  async deleteDocument(id: number): Promise<void> {
    const response = await paperlessFetch(this.connection, `/api/documents/${id}/`, {
      method: 'DELETE',
      timeoutMs: READ_TIMEOUT_MS,
    });
    await ensureOk(response);
  }

  /** Get the public base URL for constructing "View in Paperless" links. */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /** List all correspondents. */
  async getCorrespondents(): Promise<PaperlessCorrespondent[]> {
    const raw = await this.get<RawPaperlessPaginatedResponse<RawPaperlessCorrespondent>>(
      '/api/correspondents/?page_size=100'
    );
    return raw.results.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      documentCount: c.document_count,
    }));
  }

  /** List all tags. */
  async getTags(): Promise<PaperlessTag[]> {
    const raw = await this.get<RawPaperlessPaginatedResponse<RawPaperlessTag>>(
      '/api/tags/?page_size=100'
    );
    return raw.results.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      colour: t.colour,
      isInboxTag: t.is_inbox_tag,
      documentCount: t.document_count,
    }));
  }

  /** List all document types. */
  async getDocumentTypes(): Promise<PaperlessDocumentType[]> {
    const raw = await this.get<RawPaperlessPaginatedResponse<RawPaperlessDocumentType>>(
      '/api/document_types/?page_size=100'
    );
    return raw.results.map((dt) => ({
      id: dt.id,
      slug: dt.slug,
      name: dt.name,
      documentCount: dt.document_count,
    }));
  }

  // -------------------------------------------------------------------------
  // Mappers
  // -------------------------------------------------------------------------

  private mapDocument(raw: RawPaperlessDocument): PaperlessDocument {
    return {
      id: raw.id,
      correspondentId: raw.correspondent,
      documentTypeId: raw.document_type,
      title: raw.title,
      content: raw.content,
      tagIds: raw.tags,
      created: raw.created,
      createdDate: raw.created_date,
      modified: raw.modified,
      added: raw.added,
      archiveSerialNumber: raw.archive_serial_number,
      originalFileName: raw.original_file_name,
      archivedFileName: raw.archived_file_name,
    };
  }

  // -------------------------------------------------------------------------
  // HTTP
  // -------------------------------------------------------------------------

  private async get<T>(path: string): Promise<T> {
    return this.requestJson<T>(path, { method: 'GET' });
  }

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    const response = await paperlessFetch(this.connection, path, {
      ...init,
      headers,
      timeoutMs: READ_TIMEOUT_MS,
    });
    return (await (await ensureOk(response)).json()) as T;
  }
}
