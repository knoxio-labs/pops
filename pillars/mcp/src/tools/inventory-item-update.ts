import { createHash } from 'node:crypto';

import { sendItemMutation } from './inventory-sync-client.js';

import type { CallResult } from '@pops/pillar-sdk/client';

import type { UpdateItemMutationInput } from './inventory-item-mutation-input.js';
import type { MutationOutcome } from './inventory-sync-client.js';

function codeMutationId(mutationId: string): string {
  const hash = createHash('sha256').update(`${mutationId}:item.setCode`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Applies code before other edits, preserving each command's identity on unchanged retries. */
export async function updateItemMutation(
  input: UpdateItemMutationInput
): Promise<CallResult<MutationOutcome>> {
  const args = {
    ...(input.itemName === undefined ? {} : { name: input.itemName }),
    ...(input.note === undefined ? {} : { note: input.note }),
    ...(input.fieldValues === undefined ? {} : { values: input.fieldValues }),
    ...(input.externalIds === undefined ? {} : { externalIds: input.externalIds }),
    ...(input.provenance === undefined ? {} : { legacy: input.provenance }),
  };
  let revision = input.itemRevision;
  if (input.code !== undefined) {
    const result = await sendItemMutation({
      entityId: input.id,
      op: 'item.setCode',
      args: { code: input.code },
      baseRevision: revision,
      catalogueRevision: input.catalogueRevision,
      ...(input.mutationId === undefined ? {} : { mutationId: codeMutationId(input.mutationId) }),
    });
    if (
      result.kind !== 'ok' ||
      result.value.status !== 'applied' ||
      Object.keys(args).length === 0
    ) {
      return result;
    }
    revision = result.value.revision;
  }
  return sendItemMutation({
    entityId: input.id,
    op: 'item.edit',
    args,
    baseRevision: revision,
    catalogueRevision: input.catalogueRevision,
    ...(input.mutationId === undefined ? {} : { mutationId: input.mutationId }),
  });
}
