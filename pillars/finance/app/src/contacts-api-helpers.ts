/**
 * Helpers for the generated Hey API contacts SDK.
 *
 * Lives outside `src/contacts-api/` because codegen wipes that
 * directory on every regeneration. Anything hand-authored here is safe.
 *
 * `unwrap` turns a Hey API `{ data, error, response }` result into its
 * data payload, throwing `ContactsApiError` (carrying the HTTP status)
 * on failure so call sites can inspect `.status`.
 */

interface SdkErrorBody {
  message?: unknown;
}

export class ContactsApiError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.name = 'ContactsApiError';
    this.status = status;
  }
}

export function unwrap<T>(result: { data?: T; error?: unknown; response?: Response }): T {
  if (result.error !== undefined) {
    const body = result.error as SdkErrorBody;
    const message =
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : 'contacts API request failed';
    throw new ContactsApiError(message, result.response?.status);
  }
  if (result.data === undefined) {
    throw new ContactsApiError('contacts API returned no data', result.response?.status);
  }
  return result.data;
}
