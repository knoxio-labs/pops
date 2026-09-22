import { projectProtocol1Catalogue } from '../../catalogue/index.js';

import type { z } from 'zod';

import type { CatalogueDescriptorSchema } from '../../contract/rest-sync.js';
import type { CommandDb } from '../../domain/commands/index.js';

/** The protocol-1 catalogue descriptor on the wire. */
export type CatalogueWire = z.infer<typeof CatalogueDescriptorSchema>;

/** Project persisted catalogue revision 1 into the temporary protocol-1 descriptor. */
export function readProtocol1Catalogue(db: CommandDb): CatalogueWire {
  const descriptor = projectProtocol1Catalogue(db);
  return {
    version: descriptor.version,
    units: descriptor.units.map((unit) => ({ ...unit })),
    types: descriptor.types.map((type) => ({
      ...type,
      capabilities: [...type.capabilities],
      legacyLabels: [...type.legacyLabels],
      fields: type.fields.map(({ choices, ...field }) =>
        choices === undefined ? field : { ...field, choices: [...choices] }
      ),
    })),
  };
}
