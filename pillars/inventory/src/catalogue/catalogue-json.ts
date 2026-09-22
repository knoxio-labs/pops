/** Strict decoding for persisted JSON catalogue columns. */
import { CatalogueDataError } from './catalogue-error.js';

/** Decodes a persisted JSON string array. */
export function parseStringArray(value: string, label: string): readonly string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CatalogueDataError(`${label} contains invalid JSON`);
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new CatalogueDataError(`${label} must be a JSON string array`);
  }
  return parsed;
}

/** Decodes a persisted JSON object. */
export function parseObject(value: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new CatalogueDataError(`${label} contains invalid JSON`);
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new CatalogueDataError(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}
