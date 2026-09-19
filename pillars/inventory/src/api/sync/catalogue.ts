import { INVENTORY_TYPES, projectCatalogue } from '../../types/index.js';

import type { z } from 'zod';

import type { CatalogueDescriptorSchema } from '../../contract/rest-sync.js';

/** The catalogue descriptor on the wire. */
export type CatalogueWire = z.infer<typeof CatalogueDescriptorSchema>;

function toWire(): CatalogueWire {
  const descriptor = projectCatalogue(INVENTORY_TYPES);
  return {
    version: descriptor.version,
    units: descriptor.units.map((unit) => ({ ...unit })),
    types: descriptor.types.map((type) => ({
      key: type.key,
      name: type.name,
      capabilities: [...type.capabilities],
      fields: type.fields.map(({ choices, ...field }) =>
        choices === undefined ? field : { ...field, choices: [...choices] }
      ),
      legacyLabels: [...type.legacyLabels],
    })),
  };
}

/**
 * The catalogue this build serves. Types are code, so it cannot change while
 * the process runs; projected once at load.
 */
export const CATALOGUE: CatalogueWire = toWire();
