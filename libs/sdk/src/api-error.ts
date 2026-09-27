/** The browser-facing category of an API failure. */
export type ApiErrorKind = 'offline' | 'timeout' | 'server' | 'client';

/** A validation issue exposed by older inventory responses through `ApiError.issues`. */
export interface ApiErrorIssue {
  readonly code: string;
  readonly definitionId: string | null;
  readonly message: string;
  readonly path: string;
}

/** Values used to construct an {@link ApiError}. */
export interface ApiErrorInit {
  readonly code: string;
  readonly details?: unknown;
  readonly kind: ApiErrorKind;
  readonly message: string;
  readonly requestId?: string;
  readonly retryable: boolean;
  readonly status?: number;
}

/** The generated-client result shape accepted by {@link unwrap}. */
export interface ApiResult<T> {
  readonly data?: T;
  readonly error?: unknown;
  readonly response?: {
    readonly headers?: { get(name: string): string | null };
    readonly status: number;
  };
}

/** Messages used when a generated client did not return an ADR-054 envelope. */
export interface UnwrapOptions {
  readonly fallbackMessage?: string | ((status: number | undefined) => string);
  readonly noDataMessage?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function statusKind(status: number | undefined): ApiErrorKind {
  if (status === undefined) return 'offline';
  return status >= 500 ? 'server' : 'client';
}

function statusRetryable(status: number | undefined): boolean {
  return status === undefined || status === 408 || status === 429 || status >= 500;
}

function statusCode(status: number | undefined): string {
  return status === undefined ? 'web.net.offline' : `web.http.${String(status)}`;
}

function fallbackMessage(
  status: number | undefined,
  configured: UnwrapOptions['fallbackMessage']
): string {
  if (typeof configured === 'function') return configured(status);
  if (configured !== undefined) return configured;
  return status === undefined
    ? 'The request could not reach the server'
    : `Request failed (HTTP ${String(status)})`;
}

function isApiErrorIssue(value: unknown): value is ApiErrorIssue {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    (typeof value.definitionId === 'string' || value.definitionId === null) &&
    typeof value.message === 'string' &&
    typeof value.path === 'string'
  );
}

function issuesFrom(details: unknown): readonly ApiErrorIssue[] {
  const value = isRecord(details) ? details.issues : details;
  return Array.isArray(value) ? value.filter(isApiErrorIssue) : [];
}

/**
 * A single browser error for generated-client, transport, and HTTP failures.
 *
 * The positional constructor remains for source compatibility while pillar
 * apps migrate their call sites; new code should pass {@link ApiErrorInit}.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly kind: ApiErrorKind;
  readonly requestId: string | undefined;
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(init: ApiErrorInit);
  constructor(message: string, status?: number, code?: string, details?: unknown);
  constructor(
    initOrMessage: ApiErrorInit | string,
    legacyStatus?: number,
    legacyCode?: string,
    legacyDetails?: unknown
  ) {
    const init: ApiErrorInit =
      typeof initOrMessage === 'string'
        ? {
            code: legacyCode ?? statusCode(legacyStatus),
            details: Array.isArray(legacyDetails) ? { issues: legacyDetails } : legacyDetails,
            kind: statusKind(legacyStatus),
            message: initOrMessage,
            retryable: statusRetryable(legacyStatus),
            status: legacyStatus,
          }
        : initOrMessage;
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.details = init.details;
    this.kind = init.kind;
    this.requestId = init.requestId;
    this.retryable = init.retryable;
    this.status = init.status;
  }

  /** Compatibility view for inventory callers; canonical structured data lives in `details`. */
  get issues(): readonly ApiErrorIssue[] {
    return issuesFrom(this.details);
  }
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === 'AbortError';
}

function transportError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAbortError(error)) {
    return new ApiError({
      code: 'web.net.timeout',
      kind: 'timeout',
      message: 'Request timed out',
      retryable: true,
    });
  }
  return new ApiError({
    code: 'web.net.offline',
    kind: 'offline',
    message: 'The request could not reach the server',
    retryable: true,
  });
}

function responseRequestId(response: ApiResult<unknown>['response']): string | undefined {
  return response?.headers?.get('x-request-id') ?? undefined;
}

function errorDetails(body: Record<string, unknown>): unknown {
  if (body.details !== undefined) return body.details;
  return body.issues === undefined ? body : { issues: body.issues };
}

function nonEnvelopeError<T>(result: ApiResult<T>, options: UnwrapOptions): ApiError {
  const status = result.response?.status;
  return new ApiError({
    code: statusCode(status),
    kind: statusKind(status),
    message: fallbackMessage(status, options.fallbackMessage),
    requestId: responseRequestId(result.response),
    retryable: statusRetryable(status),
    status,
  });
}

function resultError<T>(result: ApiResult<T>, options: UnwrapOptions): ApiError {
  const status = result.response?.status;
  if (isAbortError(result.error)) return transportError(result.error);
  if (!isRecord(result.error)) return nonEnvelopeError(result, options);
  if (result.error instanceof Error)
    return status === undefined ? transportError(result.error) : nonEnvelopeError(result, options);

  const body = result.error;
  return new ApiError({
    code: optionalString(body.code) ?? statusCode(status),
    details: errorDetails(body),
    kind: statusKind(status),
    message: optionalString(body.message) ?? fallbackMessage(status, options.fallbackMessage),
    requestId: optionalString(body.requestId) ?? responseRequestId(result.response),
    retryable: typeof body.retryable === 'boolean' ? body.retryable : statusRetryable(status),
    status,
  });
}

function unwrapResult<T>(result: ApiResult<T>, options: UnwrapOptions): T {
  if (result.error !== undefined) throw resultError(result, options);
  if (result.data === undefined) {
    const status = result.response?.status;
    throw new ApiError({
      code: 'web.client.no_data',
      kind: 'client',
      message: options.noDataMessage ?? 'API returned no data',
      requestId: responseRequestId(result.response),
      retryable: false,
      status,
    });
  }
  return result.data;
}

function isPromiseLike<T>(
  value: ApiResult<T> | PromiseLike<ApiResult<T>>
): value is PromiseLike<ApiResult<T>> {
  return isRecord(value) && typeof value.then === 'function';
}

/**
 * Returns generated-client data or throws an {@link ApiError}.
 *
 * Passing the client promise directly lets this function classify fetch and
 * abort rejections without relying on browser-specific message text.
 */
export function unwrap<T>(result: PromiseLike<ApiResult<T>>, options?: UnwrapOptions): Promise<T>;
export function unwrap<T>(result: ApiResult<T>, options?: UnwrapOptions): T;
export function unwrap<T>(
  result: ApiResult<T> | PromiseLike<ApiResult<T>>,
  options: UnwrapOptions = {}
): T | Promise<T> {
  if (isPromiseLike(result)) {
    return Promise.resolve(result)
      .then((resolved) => unwrapResult(resolved, options))
      .catch((error: unknown) => {
        throw transportError(error);
      });
  }
  return unwrapResult(result, options);
}
