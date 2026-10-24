import { ContactError, type ContactErrorMessage } from './errors';
import { StaleReviewError } from './review/contracts';

const messages: Record<number, ContactErrorMessage> = {
  400: 'invalidRequest',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
  413: 'tooLarge',
};

/** Surface safe HTTP diagnostics without exposing raw API bodies or contact details. */
export function unwrapResponse<T>(result: { data?: T; response?: Response }): T {
  if (!result.response) throw new ContactError('network', 'contacts.network');
  if (result.response.ok) {
    if (result.data !== undefined) return result.data;
    throw new ContactError('invalidResponse', 'contacts.response.invalid');
  }
  const status = result.response.status;
  const requestId = result.response.headers.get('x-request-id');
  const reportId = requestId && /^[a-f\d-]{36}$/iu.test(requestId) ? ` · ${requestId}` : '';
  const diagnostic = `contacts.http.${status}${reportId}`;
  if (status === 409) throw new StaleReviewError(diagnostic);
  throw new ContactError(messages[status] ?? 'service', diagnostic);
}

/** Preserve reportable application errors while sanitizing fetch and unexpected failures. */
export async function contactRequest<T>(
  request: () => Promise<{ data?: T; response?: Response }>
): Promise<T> {
  let result: { data?: T; response?: Response };
  try {
    result = await request();
  } catch {
    throw new ContactError('network', 'contacts.network');
  }
  return unwrapResponse(result);
}
