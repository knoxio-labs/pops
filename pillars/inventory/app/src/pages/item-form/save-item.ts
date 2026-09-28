import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { InventoryApiError } from '../../inventory-api-helpers.js';
import {
  sendInventoryMutation,
  type InventoryMutationOutcome,
} from '../../inventory-web/mutation-client.js';
import { createItem, saveItemEdits } from './save-item-operations';

import type { InventoryCommand } from '../../inventory-web/commands.js';
import type { FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';
import type { SendCommandOptions } from './save-item-operations';
import type { SaveRefusal, SaveResult } from './save-types';

export type { SaveRefusal, SaveResult, SaveSuccess } from './save-types';

/** Inputs for one edit save, including the revision read when the form opened. */
export interface SaveEditRequest {
  readonly id: string;
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly type: FormTypeDef | null;
  readonly catalogueRevision: number;
  readonly baseRevision: number;
}

/** Save operations used by the item form. */
export interface ItemSaveApi {
  readonly saving: boolean;
  readonly create: (
    draft: ItemDraft,
    type: FormTypeDef | null,
    catalogueRevision: number
  ) => Promise<SaveResult>;
  readonly saveEdits: (request: SaveEditRequest) => Promise<SaveResult>;
}

function refusalFor(
  outcome: Exclude<InventoryMutationOutcome, { status: 'applied' }>
): SaveRefusal {
  if (outcome.status === 'conflict' && outcome.kind === 'code_collision') {
    return {
      kind: 'code-taken',
      suggestedCode: outcome.suggestedCode,
      holder: outcome.heldBy,
    };
  }
  if (outcome.status === 'rejected') return { kind: 'message', message: outcome.message };
  if (outcome.status === 'conflict')
    return { kind: 'message', message: 'This item changed elsewhere.' };
  return { kind: 'message', message: 'The save was deferred. Try again.' };
}

async function send(
  command: InventoryCommand,
  entityId: string,
  options: SendCommandOptions = {}
): Promise<SaveResult> {
  try {
    const outcome = await sendInventoryMutation({ command, entityId, ...options });
    if (outcome.status !== 'applied') return { status: 'refused', refusal: refusalFor(outcome) };
    return { status: 'saved', result: { itemId: entityId, revision: outcome.revision } };
  } catch (error: unknown) {
    return {
      status: 'refused',
      refusal: {
        kind: 'failed',
        message:
          error instanceof InventoryApiError
            ? error.message
            : 'The inventory service did not answer.',
      },
    };
  }
}

/** Provides create and edit saves over the inventory mutation protocol. */
export function useItemSave(): ItemSaveApi {
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const run = useCallback(async (operation: () => Promise<SaveResult>): Promise<SaveResult> => {
    setSaving(true);
    try {
      return await operation();
    } finally {
      setSaving(false);
    }
  }, []);
  const create = useCallback(
    (draft: ItemDraft, type: FormTypeDef | null, catalogueRevision: number): Promise<SaveResult> =>
      run(() => createItem({ draft, type, catalogueRevision, queryClient, send })),
    [queryClient, run]
  );
  const saveEdits = useCallback(
    (request: SaveEditRequest): Promise<SaveResult> =>
      run(() => saveItemEdits({ ...request, queryClient, send })),
    [queryClient, run]
  );
  return { saving, create, saveEdits };
}
