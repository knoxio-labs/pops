import { draftFieldEntries, draftFieldPatches, draftOverrideChanges } from './field-values';
import { wirePlacement } from './save-item-wire';

import type { InventoryCommand } from '../../inventory-web/commands.js';
import type { FormTypeDef } from './field-model';
import type { ItemDraft } from './form-draft';
import type { SaveEditOptions, SaveResult, SendCommand } from './save-types';

interface EditState {
  readonly draft: ItemDraft;
  readonly revision: number;
}

interface EditCommandOptions {
  readonly command: InventoryCommand;
  readonly id: string;
  readonly state: EditState;
  readonly next: ItemDraft;
  readonly catalogueRevision: number;
  readonly send: SendCommand;
}

interface EditCommandResult {
  readonly result: SaveResult | null;
  readonly state: EditState;
}

async function applyEditCommand(options: EditCommandOptions): Promise<EditCommandResult> {
  const result = await options.send(options.command, options.id, {
    baseRevision: options.state.revision,
    catalogueRevision: options.catalogueRevision,
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

async function applyTypeChange(options: SaveEditOptions): Promise<EditCommandResult> {
  const state: EditState = { draft: options.initial, revision: options.baseRevision };
  if (options.draft.typeId === options.initial.typeId) return { result: null, state };
  if (options.draft.typeId === null || options.type === null)
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
      args: { typeId: options.type.id, values: draftFieldEntries(options.draft, options.type) },
    },
    id: options.id,
    state,
    catalogueRevision: options.catalogueRevision,
    next: {
      ...options.initial,
      typeId: options.draft.typeId,
      fields: options.draft.fields,
      overrides: {},
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
  const values = includeFields ? draftFieldPatches(draft, initial, type) : [];
  if (values.length > 0) args.values = values;
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
  };
}

function withOverride(draft: ItemDraft, fieldId: string, value: string | null): ItemDraft {
  const overrides = { ...draft.overrides };
  if (value === null) delete overrides[fieldId];
  else overrides[fieldId] = value;
  return { ...draft, overrides };
}

function samePlacement(left: ItemDraft, right: ItemDraft): boolean {
  return JSON.stringify(left.placement) === JSON.stringify(right.placement);
}

async function applyCoreEdit(
  options: SaveEditOptions,
  state: EditState
): Promise<EditCommandResult> {
  const { draft, type } = options;
  const changes = editArgs(draft, state.draft, type, draft.typeId === state.draft.typeId);
  if (Object.keys(changes).length === 0) return { result: null, state };
  return applyEditCommand({
    command: { op: 'item.edit', args: changes },
    id: options.id,
    state,
    next: nextDraft(state.draft, draft),
    catalogueRevision: options.catalogueRevision,
    send: options.send,
  });
}

function overrideCommand(
  change: ReturnType<typeof draftOverrideChanges>[number]
): InventoryCommand {
  return change.kind === 'set'
    ? {
        op: 'item.setOverride',
        args: { fieldId: change.fieldId, values: [change.value] as const },
      }
    : { op: 'item.clearOverride', args: { fieldId: change.fieldId } };
}

async function applyOverrides(
  options: SaveEditOptions,
  state: EditState
): Promise<EditCommandResult> {
  let current = state;
  for (const change of draftOverrideChanges(options.draft, current.draft, options.type)) {
    const result = await applyEditCommand({
      command: overrideCommand(change),
      id: options.id,
      state: current,
      next: withOverride(
        current.draft,
        change.fieldId,
        change.kind === 'set' ? (options.draft.overrides[change.fieldId] ?? null) : null
      ),
      catalogueRevision: options.catalogueRevision,
      send: options.send,
    });
    if (result.result !== null) return result;
    current = result.state;
  }
  return { result: null, state: current };
}

async function applyPlacement(
  options: SaveEditOptions,
  state: EditState
): Promise<EditCommandResult> {
  if (samePlacement(options.draft, state.draft)) return { result: null, state };
  return applyEditCommand({
    command: {
      op: 'item.move',
      args: { to: wirePlacement(options.draft.placement), verb: 'move' },
    },
    id: options.id,
    state,
    next: { ...state.draft, placement: options.draft.placement },
    catalogueRevision: options.catalogueRevision,
    send: options.send,
  });
}

async function applyCode(options: SaveEditOptions, state: EditState): Promise<EditCommandResult> {
  if (options.draft.code.value === state.draft.code.value) return { result: null, state };
  return applyEditCommand({
    command: { op: 'item.setCode', args: { code: options.draft.code.value.trim() || null } },
    id: options.id,
    state,
    next: { ...state.draft, code: options.draft.code },
    catalogueRevision: options.catalogueRevision,
    send: options.send,
  });
}

export async function applyItemEditSteps(
  options: SaveEditOptions,
  state: EditState
): Promise<EditCommandResult> {
  for (const apply of [applyCoreEdit, applyOverrides, applyPlacement, applyCode]) {
    const result = await apply(options, state);
    if (result.result !== null) return result;
    state = result.state;
  }
  return { result: null, state };
}

export async function applyItemTypeChange(options: SaveEditOptions): Promise<EditCommandResult> {
  return applyTypeChange(options);
}
