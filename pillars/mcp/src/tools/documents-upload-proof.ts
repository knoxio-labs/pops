const immutableFields = [
  'operationId',
  'fileName',
  'title',
  'mimeType',
  'byteLength',
  'sha256',
] as const;

/** Compare every immutable field of canonical Documents upload inputs, including the optional title. */
export function matchesUploadInput(actual: unknown, expected: unknown): boolean {
  return (
    isUploadProofRecord(actual) &&
    isUploadProofRecord(expected) &&
    immutableFields.every((field) => actual[field] === expected[field])
  );
}

/** Narrow an upload proof object without trusting arrays or unvalidated JSON primitives. */
export function isUploadProofRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read the canonical response envelope; callers still validate the published response schema. */
export function uploadResponseData(value: unknown): unknown {
  return isUploadProofRecord(value) ? value['data'] : undefined;
}
