import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { draftFields } from './form-draft';
import { wirePlacement } from './save-item-wire';

import type { QueryClient } from '@tanstack/react-query';

import type { InventoryCommand } from '../../inventory-web/commands.js';
import type { FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';
import type { SaveResult } from './save-types';

/** Options accepted by one inventory mutation sender used by the form. */
export interface SendCommandOptions {
  readonly baseRevision?: number;
}

/** Sends one inventory mutation command and returns the normalized save result. */
export type SendCommand = (
  command: InventoryCommand,
  entityId: string,
  options?: SendCommandOptions
) => Promise<SaveResult>;

/** Inputs for creating an item through the existing inventory mutation protocol. */
export interface CreateItemOptions {
  readonly draft: ItemDraft;
  readonly typeKey: string | null;
  readonly type: FormTypeDef | null;
  readonly queryClient: QueryClient;
  readonly send: SendCommand;
}

/** Creates an item through the existing inventory mutation protocol. */
export async function createItem(options: CreateItemOptions): Promise<SaveResult> {
  const { draft, queryClient, send, type, typeKey } = options;
  const itemId = crypto.randomUUID();
  const code = draft.code.value.trim();
  const command = {
    op: 'item.create' as const,
    args: {
      item: {
        name: draft.name.trim(),
        placement: wirePlacement(draft.placement),
        ...(typeKey === null ? {} : { typeKey }),
        fields: draftFields(draft, type),
        note: draft.note.trim() || undefined,
        quantity: Number(draft.quantity),
      },
      ...(code === '' ? {} : { code }),
    },
  };
  const result = await send(command, itemId);
  if (result.status === 'saved')
    void queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
  return result;
}

export { saveItemEdits } from './save-item-edits';
export type { SaveEditOptions } from './save-item-edits';
