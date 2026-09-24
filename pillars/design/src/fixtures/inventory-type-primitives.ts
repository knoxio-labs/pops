import type { CatalogueFieldKind } from './inventory-type-fields';

/**
 * Owner-facing metadata for one primitive: its label in the kind picker, the
 * value rule the API enforces (none of these rules is configurable per field),
 * and a fictional canonical value.
 */
export interface CataloguePrimitiveDefinition {
  kind: CatalogueFieldKind;
  label: string;
  example: string;
  contract: string;
}

/** Fictional examples and exact value rules for every supported catalogue primitive. */
export const cataloguePrimitiveDefinitions: readonly CataloguePrimitiveDefinition[] = [
  {
    kind: 'short_text',
    label: 'Short text',
    example: 'CalDigit',
    contract: '1 to 200 characters',
  },
  {
    kind: 'long_text',
    label: 'Long text',
    example: 'Kept with the travel power kit.',
    contract: '1 to 20,000 characters, line breaks kept',
  },
  {
    kind: 'integer',
    label: 'Integer',
    example: '4',
    contract: 'Whole number within ±9,007,199,254,740,991',
  },
  {
    kind: 'decimal',
    label: 'Decimal',
    example: '12.340',
    contract: 'Exact decimal, up to 18 digits and 9 decimal places; scale is kept',
  },
  {
    kind: 'boolean',
    label: 'Yes / no',
    example: 'Yes',
    contract: 'One yes or no value',
  },
  {
    kind: 'enum',
    label: 'Options',
    example: 'USB-C',
    contract: 'One of this field’s active options',
  },
  {
    kind: 'measurement',
    label: 'Measurement',
    example: '1.25 kg',
    contract: 'Exact decimal amount in the field’s fixed unit',
  },
  {
    kind: 'date',
    label: 'Date',
    example: '2026-09-22',
    contract: 'Calendar date, no time or time zone',
  },
  {
    kind: 'date_time',
    label: 'Date and time',
    example: '2026-09-22T04:05:06.123Z',
    contract: 'UTC timestamp to the millisecond',
  },
  {
    kind: 'url',
    label: 'URL',
    example: 'https://example.com/products/ts4',
    contract: 'Absolute HTTPS address',
  },
  {
    kind: 'reference',
    label: 'Reference',
    example: 'Hallway cabinet',
    contract: 'A live item or location, kept by identity',
  },
];

/** Looks up the definition for one primitive kind. */
export function primitiveDefinition(kind: CatalogueFieldKind): CataloguePrimitiveDefinition {
  const found = cataloguePrimitiveDefinitions.find((candidate) => candidate.kind === kind);
  if (found === undefined) throw new Error(`Missing primitive definition for ${kind}`);
  return found;
}
