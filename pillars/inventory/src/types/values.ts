/**
 * The closed set of value shapes a type's field can declare, and the zod
 * schema each shape validates a stored value against.
 *
 * This is the vocabulary ADR-002 (D5) calls protocol: the wire and the
 * database only ever hold one of these six shapes, never a type's own
 * invention, which is what lets a phone that has never seen a given type
 * still render any field generically.
 */
import { z } from 'zod';

import { unitsForDimension } from './units.js';

import type { Dimension } from './units.js';

export const FIELD_KINDS = ['text', 'choice', 'flag', 'measurement', 'range', 'link'] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

/** A measurement's stored shape: the amount, in the unit it was typed in. */
export interface MeasurementValue {
  readonly value: number;
  readonly unit: string;
}

/** A range's stored shape: an inclusive low and high, sharing one unit. */
export interface RangeValue {
  readonly low: number;
  readonly high: number;
  readonly unit: string;
}

/** The stored shape for each {@link FieldKind}. */
export interface FieldValueByKind {
  text: string;
  choice: string;
  flag: boolean;
  measurement: MeasurementValue;
  range: RangeValue;
  link: string;
}

export type FieldValue = FieldValueByKind[FieldKind];

/**
 * The subset of a field's declaration that a value schema needs: enough to
 * build a `choice`'s enum or a `measurement`/`range`'s unit set, without
 * depending on the full `FieldDefinition` (which also carries display-only
 * properties this module has no reason to know about).
 */
export interface FieldValueSchemaInput {
  readonly kind: FieldKind;
  readonly choices?: readonly string[];
  readonly dimension?: Dimension;
}

/**
 * The zod schema a field's stored value must satisfy, derived from its kind
 * (and, for `choice`, `measurement` and `range`, the closed set that kind
 * declares). `pillars/inventory/src/types/define-type.ts` calls this once
 * per field to build a type's fields-blob schema.
 */
export function fieldValueSchema(field: FieldValueSchemaInput): z.ZodTypeAny {
  switch (field.kind) {
    case 'text':
      return z.string().min(1);
    case 'link':
      return z.url();
    case 'flag':
      return z.boolean();
    case 'choice': {
      const choices = field.choices;
      if (!choices || choices.length === 0) {
        throw new Error('a "choice" field needs a non-empty `choices` list');
      }
      const [first, ...rest] = choices;
      return z.enum([first as string, ...rest]);
    }
    case 'measurement': {
      const dimension = field.dimension;
      if (!dimension) {
        throw new Error('a "measurement" field needs a `dimension`');
      }
      return z.object({
        value: z.number(),
        unit: z.enum(unitsForDimension(dimension)),
      });
    }
    case 'range': {
      const dimension = field.dimension;
      if (!dimension) {
        throw new Error('a "range" field needs a `dimension`');
      }
      return z
        .object({
          low: z.number(),
          high: z.number(),
          unit: z.enum(unitsForDimension(dimension)),
        })
        .refine((range) => range.low <= range.high, {
          message: 'low must not exceed high',
          path: ['low'],
        });
    }
  }
}
