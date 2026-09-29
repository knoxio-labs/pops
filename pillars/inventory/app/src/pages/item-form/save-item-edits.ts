import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { applyItemEditSteps, applyItemTypeChange } from './save-item-steps';

import type { SaveEditOptions, SaveResult } from './save-types';

/** Saves edit operations in dependency order and preserves partial progress on refusal. */
export async function saveItemEdits(options: SaveEditOptions): Promise<SaveResult> {
  const typeResult = await applyItemTypeChange(options);
  if (typeResult.result !== null) return typeResult.result;
  const editResult = await applyItemEditSteps(options, typeResult.state);
  if (editResult.result !== null) return editResult.result;
  void options.queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
  return { status: 'saved', result: { itemId: options.id, revision: editResult.state.revision } };
}
