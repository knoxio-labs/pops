/** Strict decoding for persisted JSON catalogue columns. */
import { z } from 'zod';

import { PrimitiveWireValueSchema } from '../contract/rest-catalogue-expression-schema.js';
import { CatalogueDataError } from './catalogue-error.js';

import type { PrimitiveWireValue } from './value-types.js';

const PrimitiveWireValuesSchema = z.array(PrimitiveWireValueSchema);

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new CatalogueDataError(`${label} contains invalid JSON`);
  }
}

/** Decodes a persisted JSON string array. */
export function parseStringArray(value: string, label: string): readonly string[] {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string')) {
    throw new CatalogueDataError(`${label} must be a JSON string array`);
  }
  return parsed;
}

/** Decodes a persisted JSON object. */
export function parseObject(value: string, label: string): Record<string, unknown> {
  const parsed = parseJson(value, label);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new CatalogueDataError(`${label} must be a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/** Decodes a persisted JSON array of primitive wire values. */
export function parsePrimitiveValueArray(
  value: string,
  label: string
): readonly PrimitiveWireValue[] {
  const parsed = PrimitiveWireValuesSchema.safeParse(parseJson(value, label));
  if (!parsed.success) {
    throw new CatalogueDataError(`${label} must be a JSON array of primitive values`);
  }
  return parsed.data;
}
