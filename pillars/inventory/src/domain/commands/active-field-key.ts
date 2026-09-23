import { z } from 'zod';

/** Whether an event/change key is a stable catalogue field ID. */
export function isActiveFieldName(field: string): boolean {
  return z.uuid().safeParse(field).success;
}
