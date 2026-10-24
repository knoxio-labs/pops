import type { ChangeSetOp } from '../../../contract/rest-corrections.js';
import type { transactionCorrections } from '../../../db/schema.js';

/** Build a persistence patch from the supplied correction fields, leaving absent fields unchanged. */
export function buildEditUpdates(
  op: Extract<ChangeSetOp, { op: 'edit' }>
): Partial<typeof transactionCorrections.$inferInsert> {
  const updates: Partial<typeof transactionCorrections.$inferInsert> = {};
  if (op.data.entityId !== undefined) updates.entityId = op.data.entityId;
  if (op.data.entityName !== undefined) updates.entityName = op.data.entityName;
  if (op.data.location !== undefined) updates.location = op.data.location;
  if (op.data.tags !== undefined) updates.tags = JSON.stringify(op.data.tags);
  if (op.data.transactionType !== undefined) updates.transactionType = op.data.transactionType;
  if (op.data.isActive !== undefined) updates.isActive = op.data.isActive;
  if (op.data.confidence !== undefined) updates.confidence = op.data.confidence;
  if (op.data.priority !== undefined) updates.priority = op.data.priority;
  return updates;
}
