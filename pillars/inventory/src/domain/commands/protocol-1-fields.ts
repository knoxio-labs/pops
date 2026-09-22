import { Protocol1ValueError, type Protocol1Fields } from '../../catalogue/protocol-1-types.js';
import { validateProtocol1Fields } from '../../catalogue/protocol-1-values.js';
import { ValueValidationError } from '../../catalogue/value-codec.js';
import { CommandRejected } from './errors.js';
import { itemFieldsBlobSchema } from './item-fields.js';

import type { CommandDb } from '../../db/command-db.js';
import type { JsonValue } from './outcome.js';

/** Validates a protocol-1 field projection and presents invalid values as a command rejection. */
export function assertProtocol1Fields(
  db: CommandDb,
  typeId: string,
  fields: Readonly<Record<string, unknown>>
): void {
  try {
    validateProtocol1Fields(db, { typeId, fields });
  } catch (error) {
    if (error instanceof Protocol1ValueError || error instanceof ValueValidationError) {
      throw new CommandRejected('invalid', error.message);
    }
    throw error;
  }
}

/** Validates a persisted protocol-1 projection before it enters the event/conflict JSON path. */
export function protocol1FieldsAsJson(fields: Protocol1Fields): Record<string, JsonValue> {
  const parsed = itemFieldsBlobSchema.safeParse(fields);
  if (!parsed.success) {
    throw new Error('persisted protocol-1 fields are not JSON values');
  }
  return parsed.data;
}
