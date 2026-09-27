import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { applyItemEditSteps, applyItemTypeChange } from './save-item-steps';

import type { QueryClient } from '@tanstack/react-query';

import type { FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';
import type { SaveResult, SendCommand } from './save-types';

/** Inputs for applying an edited item draft through stable catalogue commands. */
export interface SaveEditOptions {
  readonly id: string;
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly type: FormTypeDef | null;
  readonly catalogueRevision: number;
  readonly baseRevision: number;
  readonly queryClient: QueryClient;
  readonly send: SendCommand;
}

/** Saves edit operations in dependency order and preserves partial progress on refusal. */
export async function saveItemEdits(options: SaveEditOptions): Promise<SaveResult> {
  const typeResult = await applyItemTypeChange(options);
  if (typeResult.result !== null) return typeResult.result;
  const editResult = await applyItemEditSteps(options, typeResult.state);
  if (editResult.result !== null) return editResult.result;
  void options.queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
  return { status: 'saved', result: { itemId: options.id, revision: editResult.state.revision } };
}
