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
import { client } from './contacts-api/client.gen.js';

import type {
  Entity as ContactEntity,
  EntitiesUploadAvatarErrors,
  EntitiesUploadAvatarResponses,
} from './contacts-api/index.js';

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

/**
 * `PUT /entities/{id}/avatar`, called against the low-level `client` rather
 * than the generated `entitiesUploadAvatar` wrapper: the wrapper's body type
 * is `Array<number>`, a codegen artifact of `Vec<u8>` projecting to a JSON
 * `array of integer` schema rather than `format: binary` (the OpenAPI
 * document itself carries the same shape — see
 * `pillars/contacts/src/entities/routes.rs`'s `upload_avatar`). Sending an
 * actual `number[]` as a fetch body serializes to a comma-joined decimal
 * string, not raw bytes, so the real image data has to go through as a File
 * instead — which the generated type does not accept without a cast. The
 * low-level `client.put` types `body` as `unknown`, so a `File` passes
 * through untyped and correctly, with the response still fully typed via the
 * two type arguments.
 */
export async function uploadEntityAvatar(id: string, file: File): Promise<ContactEntity> {
  const result = await client.put<EntitiesUploadAvatarResponses, EntitiesUploadAvatarErrors>({
    url: '/entities/{id}/avatar',
    path: { id },
    body: file,
    headers: { 'Content-Type': file.type },
  });
  return unwrap(result).data;
}

/**
 * `GET /entities/{id}/avatar` as an `<img src>` URL. Not content-addressed
 * (unlike finance's own `/logos/:id`) — the path is the entity id, stable
 * across a replacement upload — so `avatarAssetId` is appended as a query
 * param purely to bust the browser cache the moment it changes.
 */
export function entityAvatarUrl(entityId: string, avatarAssetId: string): string {
  return `/contacts-api/entities/${entityId}/avatar?v=${encodeURIComponent(avatarAssetId)}`;
}
