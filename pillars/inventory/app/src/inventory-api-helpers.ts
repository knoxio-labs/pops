/**
 * Helpers for the generated Hey API inventory SDK.
 *
 * Lives outside `src/inventory-api/` because codegen wipes that
 * directory on every regeneration. Anything hand-authored here is safe.
 *
 * `unwrap` turns a Hey API `{ data, error, response }` result into its
 * data payload, throwing `InventoryApiError` (carrying the HTTP status)
 * on failure. The status lets call sites distinguish:
 *   - 404            → "not found"   (isNotFoundError)
 *   - 5xx / no status → "unavailable" (isUnavailableError)
 */

interface SdkErrorBody {
  code?: unknown;
  issues?: unknown;
  message?: unknown;
}

/** One definition-level validation issue returned by catalogue authoring. */
export interface InventoryApiIssue {
  readonly code: string;
  readonly definitionId: string | null;
  readonly message: string;
  readonly path: string;
}

function apiIssues(value: unknown): readonly InventoryApiIssue[] {
  if (!Array.isArray(value)) return [];
  return value.filter((issue): issue is InventoryApiIssue => {
    if (typeof issue !== 'object' || issue === null) return false;
    const candidate = issue as Record<string, unknown>;
    return (
      typeof candidate.code === 'string' &&
      (typeof candidate.definitionId === 'string' || candidate.definitionId === null) &&
      typeof candidate.message === 'string' &&
      typeof candidate.path === 'string'
    );
  });
}

/** Error raised after a generated Inventory client call returns an error body. */
export class InventoryApiError extends Error {
  readonly code: string | undefined;
  readonly issues: readonly InventoryApiIssue[];
  readonly status: number | undefined;
  constructor(
    message: string,
    status: number | undefined,
    code?: string,
    issues: readonly InventoryApiIssue[] = []
  ) {
    super(message);
    this.name = 'InventoryApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

/** Returns a successful generated-client payload or raises its typed API error. */
export function unwrap<T>(result: { data?: T; error?: unknown; response?: Response }): T {
  if (result.error !== undefined) {
    const body = result.error as SdkErrorBody;
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : 'inventory API request failed';
    throw new InventoryApiError(
      message,
      result.response?.status,
      typeof body.code === 'string' ? body.code : undefined,
      apiIssues(body.issues)
    );
  }
  if (result.data === undefined) {
    throw new InventoryApiError('inventory API returned no data', result.response?.status);
  }
  return result.data;
}

/** True when the failure was a 404 (entity missing). */
export function isNotFoundError(err: unknown): boolean {
  return err instanceof InventoryApiError && err.status === 404;
}

/** True when the pillar was unreachable or errored server-side (no status / 5xx). */
export function isUnavailableError(err: unknown): boolean {
  return err instanceof InventoryApiError && (err.status === undefined || err.status >= 500);
}
