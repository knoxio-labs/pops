/**
 * Typed failures raised by the tags domain service.
 *
 * This layer is deliberately transport-free. API handlers translate `code`
 * into the corresponding public error envelope.
 */
export const TAGS_SERVICE_ERROR_CODES = [
  'not_found',
  'name_conflict',
  'unknown_facet',
  'parent_invalid',
  'merge_invalid',
  'window_invalid',
] as const;

export type TagsServiceErrorCode = (typeof TAGS_SERVICE_ERROR_CODES)[number];

export class TagsServiceError extends Error {
  override readonly name = 'TagsServiceError' as const;

  constructor(
    readonly code: TagsServiceErrorCode,
    message: string
  ) {
    super(message);
  }
}
