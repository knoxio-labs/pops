import { z } from 'zod';

import { CatalogueApiError } from '../../catalogue/authoring.js';
import {
  ItemFieldSetError,
  validateItemFieldValues,
  ValueValidationError,
} from '../../catalogue/index.js';

import type {
  CatalogueItemValidationBodySchema,
  CatalogueItemValidationResultSchema,
} from '../../contract/rest-catalogue-schemas.js';
import type { CommandDb } from '../../domain/commands/index.js';

type ValidationBody = z.infer<typeof CatalogueItemValidationBodySchema>;
type ValidationResult = z.infer<typeof CatalogueItemValidationResultSchema>;

/** Validates and canonicalises a complete item payload without mutating catalogue or item state. */
export function validateCatalogueItemPayload(
  db: CommandDb,
  body: ValidationBody
): ValidationResult {
  try {
    const validated = validateItemFieldValues(db, {
      typeId: body.typeId,
      catalogueRevision: body.catalogueRevision,
      fields: body.fieldValues,
      ...(body.existingItemId === undefined ? {} : { existingItemId: body.existingItemId }),
    });
    return {
      valid: true,
      typeId: body.typeId,
      catalogueRevision: body.catalogueRevision,
      fieldValues: validated.map((entry) => ({
        fieldId: entry.fieldId,
        source: entry.source,
        values: entry.values.map((value) => z.json().parse(value.value)),
      })),
    };
  } catch (error) {
    if (error instanceof ItemFieldSetError || error instanceof ValueValidationError) {
      throw new CatalogueApiError(400, 'item_validation_failed', error.message, {
        issues: [
          {
            definitionId: error.fieldId,
            path: `fieldValues.${error.fieldId}`,
            code: error.code,
            message: error.message,
          },
        ],
      });
    }
    throw error;
  }
}
