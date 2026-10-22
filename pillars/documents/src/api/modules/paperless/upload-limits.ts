/**
 * The one statement of what documents accepts for upload. Consumers read
 * these through `GET /paperless/status` rather than re-declaring them.
 */

/** Environment variable that overrides {@link DEFAULT_MAX_UPLOAD_BYTES}. */
export const MAX_UPLOAD_BYTES_ENV = 'DOCUMENTS_MAX_UPLOAD_BYTES';

/** 100 MB. */
export const DEFAULT_MAX_UPLOAD_BYTES = 104_857_600;

/** Accepted MIME types; a `type/*` entry admits every subtype of `type`. */
export const ALLOWED_UPLOAD_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'image/*',
  'text/*',
];

/**
 * The upload cap in bytes. Throws on a value that is not a positive integer,
 * so a typo in the environment fails the boot instead of silently applying
 * the default.
 */
export function resolveMaxUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[MAX_UPLOAD_BYTES_ENV];
  if (raw === undefined || raw === '') return DEFAULT_MAX_UPLOAD_BYTES;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${MAX_UPLOAD_BYTES_ENV} must be a positive integer; got '${raw}'`);
  }
  return parsed;
}

/** The media type of a `Content-Type` value, lower-cased and without parameters. */
export function mimeEssence(contentType: string | undefined): string | null {
  const essence = contentType?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(essence) ? essence : null;
}

/** Whether `essence` (from {@link mimeEssence}) is on the allowlist. */
export function isAllowedUploadMimeType(essence: string): boolean {
  const [type] = essence.split('/', 1);
  return ALLOWED_UPLOAD_MIME_TYPES.some(
    (allowed) => allowed === essence || allowed === `${type}/*`
  );
}
