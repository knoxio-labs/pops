import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { draftFieldPatch, draftFields } from './form-draft';
import { wirePlacement } from './save-item-wire';

import type { QueryClient } from '@tanstack/react-query';

import type { InventoryCommand } from '../../inventory-web/commands.js';
import type { FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';
import type { SaveResult, SendCommand } from './save-types';

/** Inputs for applying an edited item draft through the existing mutation commands. */
export interface SaveEditOptions {
  readonly id: string;
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly typeKey: string | null;
  readonly type: FormTypeDef | null;
  readonly baseRevision: number;
  readonly queryClient: QueryClient;
  readonly send: SendCommand;
}

interface EditState {
  readonly draft: ItemDraft;
  readonly revision: number;
}

interface EditCommandOptions {
  readonly command: InventoryCommand;
  readonly id: string;
  readonly state: EditState;
  readonly next: ItemDraft;
  readonly send: SendCommand;
}

interface EditCommandResult {
  readonly result: SaveResult | null;
  readonly state: EditState;
}

async function applyEditCommand(options: EditCommandOptions): Promise<EditCommandResult> {
  const result = await options.send(options.command, options.id, {
    baseRevision: options.state.revision,
  });
  if (result.status !== 'saved')
    return {
      result: { ...result, initial: options.state.draft, revision: options.state.revision },
      state: options.state,
    };
  return {
    result: null,
    state: {
      draft: options.next,
      revision: result.result.revision ?? options.state.revision,
    },
  };
}

interface TypeChangeOptions {
  readonly id: string;
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly typeKey: string | null;
  readonly type: FormTypeDef | null;
  readonly baseRevision: number;
  readonly send: SendCommand;
}

async function applyTypeChange(options: TypeChangeOptions): Promise<EditCommandResult> {
  const state: EditState = { draft: options.initial, revision: options.baseRevision };
  if (options.draft.typeId === options.initial.typeId) return { result: null, state };
  if (options.typeKey === null)
    return {
      result: {
        status: 'refused',
        refusal: { kind: 'message', message: 'This item must keep its current type.' },
        initial: options.initial,
        revision: options.baseRevision,
      },
      state,
    };
  return applyEditCommand({
    command: {
      op: 'item.changeType',
      args: { typeKey: options.typeKey, fields: draftFields(options.draft, options.type) },
    },
    id: options.id,
    state,
    next: {
      ...options.initial,
      typeId: options.draft.typeId,
      fields: options.draft.fields,
      overrides: options.draft.overrides,
    },
    send: options.send,
  });
}

function editArgs(
  draft: ItemDraft,
  initial: ItemDraft,
  type: FormTypeDef | null,
  includeFields: boolean
): Extract<InventoryCommand, { op: 'item.edit' }>['args'] {
  const args: Extract<InventoryCommand, { op: 'item.edit' }>['args'] = {};
  if (draft.name !== initial.name) args.name = draft.name.trim();
  if (draft.note !== initial.note) args.note = draft.note.trim() || null;
  const fields = includeFields ? draftFieldPatch(draft, initial, type) : {};
  if (Object.keys(fields).length > 0) args.fields = fields;
  if (draft.quantity !== initial.quantity) args.quantity = Number(draft.quantity);
  return args;
}

function nextDraft(applied: ItemDraft, draft: ItemDraft): ItemDraft {
  return {
    ...applied,
    name: draft.name,
    note: draft.note,
    quantity: draft.quantity,
    fields: draft.fields,
    overrides: draft.overrides,
  };
}

function samePlacement(left: ItemDraft, right: ItemDraft): boolean {
  return JSON.stringify(left.placement) === JSON.stringify(right.placement);
}

/** Saves edit operations in dependency order and preserves partial progress on refusal. */
export async function saveItemEdits(options: SaveEditOptions): Promise<SaveResult> {
  const { draft, id, queryClient, send, typeKey, type } = options;
  const typeResult = await applyTypeChange({ ...options, typeKey, type });
  if (typeResult.result !== null) return typeResult.result;
  let state = typeResult.state;
  const changes = editArgs(draft, state.draft, type, draft.typeId === state.draft.typeId);
  if (Object.keys(changes).length > 0) {
    const result = await applyEditCommand({
      command: { op: 'item.edit', args: changes },
      id,
      state,
      next: nextDraft(state.draft, draft),
      send,
    });
    if (result.result !== null) return result.result;
    state = result.state;
  }
  if (!samePlacement(draft, state.draft)) {
    const result = await applyEditCommand({
      command: { op: 'item.move', args: { to: wirePlacement(draft.placement), verb: 'move' } },
      id,
      state,
      next: { ...state.draft, placement: draft.placement },
      send,
    });
    if (result.result !== null) return result.result;
    state = result.state;
  }
  if (draft.code.value !== state.draft.code.value) {
    const result = await applyEditCommand({
      command: { op: 'item.setCode', args: { code: draft.code.value.trim() || null } },
      id,
      state,
      next: { ...state.draft, code: draft.code },
      send,
    });
    if (result.result !== null) return result.result;
    state = result.state;
  }
  void queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
  return { status: 'saved', result: { itemId: id, revision: state.revision } };
}
