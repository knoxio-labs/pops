import type { CatalogueFieldKind } from './inventory-type-fields';

/** Owner-facing metadata used to explain one primitive's canonical value. */
export interface CataloguePrimitiveDefinition {
  kind: CatalogueFieldKind;
  label: string;
  example: string;
  contract: string;
}

/** Fictional examples and contracts for every supported catalogue primitive. */
export const cataloguePrimitiveDefinitions: readonly CataloguePrimitiveDefinition[] = [
  {
    kind: 'short_text',
    label: 'Short text',
    example: 'CalDigit',
    contract: '1–200 Unicode scalar values',
  },
  {
    kind: 'long_text',
    label: 'Long text',
    example: 'Kept with the travel power kit.',
    contract: '1–20,000 Unicode scalar values',
  },
  {
    kind: 'integer',
    label: 'Integer',
    example: '4',
    contract: 'Whole number within the safe integer range',
  },
  {
    kind: 'decimal',
    label: 'Decimal',
    example: '12.340',
    contract: 'Exact decimal string; scale is preserved',
  },
  {
    kind: 'boolean',
    label: 'Yes / no',
    example: 'Yes',
    contract: 'One true or false value',
  },
  {
    kind: 'enum',
    label: 'Options',
    example: 'USB-C',
    contract: 'Stable option identity from this catalogue revision',
  },
  {
    kind: 'measurement',
    label: 'Measurement',
    example: '240 V',
    contract: 'Exact decimal amount in one fixed unit',
  },
  {
    kind: 'date',
    label: 'Date',
    example: '2026-09-22',
    contract: 'Gregorian calendar date',
  },
  {
    kind: 'date_time',
    label: 'Date and time',
    example: '2026-09-22T04:05:06.123Z',
    contract: 'UTC RFC 3339 timestamp with milliseconds',
  },
  {
    kind: 'url',
    label: 'URL',
    example: 'https://example.com/products/ts4',
    contract: 'Absolute HTTPS URL',
  },
  {
    kind: 'reference',
    label: 'Reference',
    example: 'MacBook Pro 16” or Office',
    contract: 'Durable item or location identity',
  },
];
