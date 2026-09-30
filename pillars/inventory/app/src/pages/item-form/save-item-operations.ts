import { WEB_ITEMS_QUERY_KEY } from '../../inventory-web/queryKeys.js';
import { draftCreateFieldValues, draftOverrideChanges } from './field-values';
import { overrideCommand } from './save-item-steps';
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
  /** Stored photo hashes to attach, in order, once the item exists. */
  readonly copiedPhotos?: readonly string[];
}

interface FollowUpOptions {
  readonly itemId: string;
  readonly revision: number | null;
  readonly draft: ItemDraft;
  readonly type: FormTypeDef | null;
  readonly copiedPhotos: readonly string[];
  readonly catalogueRevision: number;
  readonly send: SendCommand;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

async function applyCreatedOverrides(options: FollowUpOptions): Promise<number> {
  let revision = options.revision;
  let failed = 0;
  const changes = draftOverrideChanges(
    options.draft,
    { ...options.draft, overrides: {} },
    options.type
  );
  for (const change of changes) {
    const result = await options.send(overrideCommand(change), options.itemId, {
      catalogueRevision: options.catalogueRevision,
      ...(revision === null ? {} : { baseRevision: revision }),
    });
    if (result.status === 'saved') revision = result.result.revision ?? revision;
    else failed += 1;
  }
  return failed;
}

async function attachCopiedPhotos(options: FollowUpOptions): Promise<number> {
  let attached = 0;
  for (const sha256 of options.copiedPhotos) {
    const result = await options.send(
      { op: 'item.attachPhoto', args: { sha256, position: attached } },
      options.itemId
    );
    if (result.status === 'saved') attached += 1;
  }
  return attached;
}

/**
 * Applies what `item.create` cannot carry. The item already exists, so a failure here is
 * reported rather than refused: refusing would let the form create the item a second time.
 */
async function applyCreateFollowUps(
  options: FollowUpOptions
): Promise<{ readonly photos: number; readonly incomplete?: string }> {
  const failedOverrides = await applyCreatedOverrides(options);
  const photos = await attachCopiedPhotos(options);
  const failedPhotos = options.copiedPhotos.length - photos;
  const missing = [
    ...(failedOverrides > 0 ? [plural(failedOverrides, 'override')] : []),
    ...(failedPhotos > 0 ? [plural(failedPhotos, 'photo')] : []),
  ];
  if (missing.length === 0) return { photos };
  return { photos, incomplete: `Created, but ${missing.join(' and ')} did not copy.` };
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
  if (result.status !== 'saved') return result;
  const followUps = await applyCreateFollowUps({
    itemId,
    revision: result.result.revision,
    draft,
    type,
    copiedPhotos: options.copiedPhotos ?? [],
    catalogueRevision: options.catalogueRevision,
    send,
  });
  void queryClient.invalidateQueries({ queryKey: WEB_ITEMS_QUERY_KEY });
  return { status: 'saved', result: { ...result.result, ...followUps } };
}

export { saveItemEdits } from './save-item-edits';
