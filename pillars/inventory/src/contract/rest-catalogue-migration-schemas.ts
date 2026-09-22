import { z } from 'zod';

export const CatalogueMigrationStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('copy'), fromFieldId: z.uuid(), toFieldId: z.uuid() }),
  z.object({ kind: z.literal('set_default'), fieldId: z.uuid(), values: z.array(z.unknown()) }),
  z.object({
    kind: z.literal('map_enum'),
    fieldId: z.uuid(),
    optionIds: z.record(z.uuid(), z.uuid()),
  }),
  z.object({
    kind: z.literal('convert_decimal'),
    fromFieldId: z.uuid(),
    toFieldId: z.uuid(),
    factor: z.string(),
  }),
  z.object({
    kind: z.literal('replace_reference'),
    fieldId: z.uuid(),
    targetKind: z.enum(['item', 'location']),
    fromTargetId: z.uuid(),
    toTargetId: z.uuid(),
  }),
  z.object({ kind: z.literal('drop_value'), fieldId: z.uuid() }),
]);

export const CatalogueMigrationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  fromRevision: z.number().int().positive(),
  toRevision: z.number().int().positive(),
  affectedTypeIds: z.array(z.uuid()),
  affectedFieldIds: z.array(z.uuid()),
  steps: z.array(CatalogueMigrationStepSchema),
});
