import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { draftFields } from './form-draft';

import type { QueryClient } from '@tanstack/react-query';

import type { Placement } from '../../foundation/model/model';
import type { InventoryCommand, InventoryPlacementTarget } from '../../inventory-web/commands.js';
import type { ItemDraft } from './form-draft';
import type { SaveResult } from './save-types';

/** Sends one inventory mutation command and returns the normalized save result. */
export type SendCommand = (command: InventoryCommand, entityId: string) => Promise<SaveResult>;

function wirePlacement(placement: Placement): InventoryPlacementTarget {
  if (placement.kind === 'in-hand') return { kind: 'hand' };
  if (placement.kind === 'location') return { kind: 'location', locationId: placement.locationId };
  return { kind: 'container', itemId: placement.containerId };
}

function editArgs(
  draft: ItemDraft,
  initial: ItemDraft,
  includeFields: boolean
): Extract<InventoryCommand, { op: 'item.edit' }>['args'] {
  const args: Extract<InventoryCommand, { op: 'item.edit' }>['args'] = {};
  if (draft.name !== initial.name) args.name = draft.name.trim();
  if (draft.note !== initial.note) args.note = draft.note.trim() || null;
  const fieldsChanged =
    JSON.stringify(draft.fields) !== JSON.stringify(initial.fields) ||
    JSON.stringify(draft.overrides) !== JSON.stringify(initial.overrides);
  if (includeFields && fieldsChanged) args.fields = draftFields(draft);
  if (draft.quantity !== initial.quantity) args.quantity = Number(draft.quantity);
  return args;
}

/** Creates an item through the existing inventory mutation protocol. */
export async function createItem(
  draft: ItemDraft,
  typeKey: string | null,
  queryClient: QueryClient,
  send: SendCommand
): Promise<SaveResult> {
  const itemId = crypto.randomUUID();
  const code = draft.code.value.trim();
  const command = {
    op: 'item.create' as const,
    args: {
      item: {
        name: draft.name.trim(),
        placement: wirePlacement(draft.placement),
        ...(typeKey === null ? {} : { typeKey }),
        fields: draftFields(draft),
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

/** Inputs for applying an edited item draft through the existing mutation commands. */
export interface SaveEditOptions {
  readonly id: string;
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly typeKey: string | null;
  readonly queryClient: QueryClient;
  readonly send: SendCommand;
}

interface EditCommandOptions {
  readonly command: InventoryCommand;
  readonly id: string;
  readonly applied: ItemDraft;
  readonly next: ItemDraft;
  readonly send: SendCommand;
}

async function applyEditCommand(
  options: EditCommandOptions
): Promise<{ readonly result: SaveResult | null; readonly applied: ItemDraft }> {
  const result = await options.send(options.command, options.id);
  if (result.status !== 'saved')
    return { result: { ...result, initial: options.applied }, applied: options.applied };
  return { result: null, applied: options.next };
}

interface TypeChangeOptions {
  readonly id: string;
  readonly draft: ItemDraft;
  readonly initial: ItemDraft;
  readonly typeKey: string | null;
  readonly send: SendCommand;
}

async function applyTypeChange(
  options: TypeChangeOptions
): Promise<{ readonly result: SaveResult | null; readonly applied: ItemDraft }> {
  if (options.draft.typeId === options.initial.typeId)
    return { result: null, applied: options.initial };
  if (options.typeKey === null)
    return {
      result: {
        status: 'refused',
        refusal: { kind: 'message', message: 'This item must keep its current type.' },
        initial: options.initial,
      },
      applied: options.initial,
    };
  return applyEditCommand({
    command: {
      op: 'item.changeType',
      args: { typeKey: options.typeKey, fields: draftFields(options.draft) },
    },
    id: options.id,
    applied: options.initial,
    next: {
      ...options.initial,
      typeId: options.draft.typeId,
      fields: options.draft.fields,
      overrides: options.draft.overrides,
    },
    send: options.send,
  });
}

/** Saves the edit operations in dependency order and preserves partial progress on refusal. */
export async function saveItemEdits(options: SaveEditOptions): Promise<SaveResult> {
  const { draft, id, initial, queryClient, send, typeKey } = options;
  const typeResult = await applyTypeChange({ id, draft, initial, typeKey, send });
  if (typeResult.result !== null) return typeResult.result;
  let applied = typeResult.applied;
  const changes = editArgs(draft, applied, draft.typeId === applied.typeId);
  if (Object.keys(changes).length > 0) {
    const editResult = await applyEditCommand({
      command: { op: 'item.edit', args: changes },
      id,
      applied,
      next: {
        ...applied,
        name: draft.name,
        note: draft.note,
        quantity: draft.quantity,
        fields: draft.fields,
        overrides: draft.overrides,
      },
      send,
    });
    if (editResult.result !== null) return editResult.result;
    applied = editResult.applied;
  }
  if (JSON.stringify(draft.placement) !== JSON.stringify(applied.placement)) {
    const moveResult = await applyEditCommand({
      command: { op: 'item.move', args: { to: wirePlacement(draft.placement), verb: 'move' } },
      id,
      applied,
      next: { ...applied, placement: draft.placement },
      send,
    });
    if (moveResult.result !== null) return moveResult.result;
    applied = moveResult.applied;
  }
  if (draft.code.value !== applied.code.value) {
    const codeResult = await applyEditCommand({
      command: { op: 'item.setCode', args: { code: draft.code.value.trim() || null } },
      id,
      applied,
      next: { ...applied, code: draft.code },
      send,
    });
    if (codeResult.result !== null) return codeResult.result;
    applied = codeResult.applied;
  }
  void queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
  return { status: 'saved', result: { itemId: id, revision: null } };
}
