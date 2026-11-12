function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Require an object at a named location in a published contract. */
export function openApiObject(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

/** Require an array at a named location in a published contract. */
export function openApiArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

/** Read an optional string array; malformed values fail contract admission. */
export function openApiStrings(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  const values = openApiArray(value, label);
  if (!values.every((item): item is string => typeof item === 'string')) {
    throw new Error(`${label} must contain strings`);
  }
  return values;
}
