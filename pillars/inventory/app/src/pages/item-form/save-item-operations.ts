import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { draftCreateFieldValues } from './field-values';
import { wirePlacement } from './save-item-wire';

import type { QueryClient } from '@tanstack/react-query';

import type { FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';
import type { SaveResult, SendCommand } from './save-types';

export type { SaveEditOptions, SendCommand, SendCommandOptions } from './save-types';

/** Inputs for creating an item through the existing inventory mutation protocol. */
export interface CreateItemOptions {
  readonly draft: ItemDraft;
  readonly type: FormTypeDef | null;
  readonly catalogueRevision: number;
  readonly queryClient: QueryClient;
  readonly send: SendCommand;
}

/** Creates an item through the existing inventory mutation protocol. */
export async function createItem(options: CreateItemOptions): Promise<SaveResult> {
  const { draft, queryClient, send, type } = options;
  const itemId = crypto.randomUUID();
  const code = draft.code.value.trim();
  const command = {
    op: 'item.create' as const,
    args: {
      item: {
        name: draft.name.trim(),
        placement: wirePlacement(draft.placement),
        ...(type === null ? {} : { typeId: type.id }),
        values: draftCreateFieldValues(draft, type),
        note: draft.note.trim() || undefined,
        quantity: Number(draft.quantity),
      },
      ...(code === '' ? {} : { code }),
    },
  };
  const result = await send(command, itemId, { catalogueRevision: options.catalogueRevision });
  if (result.status === 'saved')
    void queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
  return result;
}

export { saveItemEdits } from './save-item-edits';
