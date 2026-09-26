import { z } from 'zod';

const AnyJson = z.unknown();
const Actor = z.object({ kind: z.string(), id: z.string().nullable(), label: z.string() });
/**
 * The live definition of the same kind that took over an archived type or
 * field. Optional so a catalogue from an Inventory that predates lineage
 * still parses; absent and null both mean none was recorded.
 */
const ReplacedBy = z.uuid().nullable().optional();
/**
 * Canonical values the phone pre-fills on item create, relayed opaquely like
 * item values. Optional so a catalogue from an Inventory that predates field
 * defaults still parses; absent means none.
 */
const DefaultValues = z.array(AnyJson).optional();

/** Immutable protocol-2 catalogue revision and its stable definitions. */
export const MobileInventoryCatalogueRevisionDescriptorSchema = z.object({
  revision: z.object({
    revision: z.number().int().positive(),
    baseRevision: z.number().int().positive().nullable(),
    status: z.enum(['draft', 'published', 'abandoned']),
    minimumProtocol: z.number().int().positive(),
    created: z.object({ actor: Actor, at: z.string() }),
    published: z.object({ actor: Actor, at: z.string(), note: z.string().nullable() }).nullable(),
    abandoned: z.object({ actor: Actor, at: z.string() }).nullable(),
  }),
  types: z.array(
    z.object({
      revision: z.number().int().positive(),
      id: z.uuid(),
      key: z.string(),
      label: z.string(),
      description: z.string().nullable(),
      sortOrder: z.number().int().nonnegative(),
      capabilities: z.array(z.string()),
      legacyLabels: z.array(z.string()),
      presentation: z.record(z.string(), AnyJson),
      archivedAt: z.string().nullable(),
      replacedBy: ReplacedBy,
      fields: z.array(
        z.object({
          id: z.uuid(),
          typeId: z.uuid(),
          key: z.string(),
          label: z.string(),
          help: z.string().nullable(),
          sortOrder: z.number().int().nonnegative(),
          kind: z.enum([
            'short_text',
            'long_text',
            'integer',
            'decimal',
            'boolean',
            'enum',
            'measurement',
            'date',
            'date_time',
            'url',
            'reference',
          ]),
          cardinality: z.enum(['one', 'many']),
          required: z.boolean(),
          storage: z.enum(['stored', 'computed']),
          fixedUnit: z.string().nullable(),
          referenceKinds: z.array(z.enum(['item', 'location'])),
          referenceTypeIds: z.array(z.uuid()),
          expressionVersion: z.number().int().positive().nullable(),
          expression: AnyJson.nullable(),
          allowOverride: z.boolean(),
          defaultValues: DefaultValues,
          presentation: z.record(z.string(), AnyJson),
          archivedAt: z.string().nullable(),
          replacedBy: ReplacedBy,
          enumOptions: z.array(
            z.object({
              id: z.uuid(),
              key: z.string(),
              label: z.string(),
              sortOrder: z.number().int().nonnegative(),
              archivedAt: z.string().nullable(),
            })
          ),
        })
      ),
    })
  ),
});

export type MobileInventoryCatalogueRevisionDescriptor = z.infer<
  typeof MobileInventoryCatalogueRevisionDescriptorSchema
>;
