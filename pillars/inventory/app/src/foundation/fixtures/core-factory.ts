/**
 * Builders for the named inventory fixtures. Defaults fill every row field
 * with a quiet active, synced value.
 */
import { typeLabel } from './core-types';

import type { ContainerAccess, ItemRowModel, Placement, PreviousPlacement } from '../model/model';

/** Creates a placement directly inside a location. */
export const at = (locationId: string): Placement => ({ kind: 'location', locationId });

/** Creates a placement inside a container. */
export const inBox = (containerId: string): Placement => ({ kind: 'container', containerId });

/** The placement for an item currently in hand. */
export const inHand: Placement = { kind: 'in-hand' };

/** Creates a remembered location placement. */
export const wasAt = (locationId: string): PreviousPlacement => ({ kind: 'location', locationId });

/** Creates a remembered container placement. */
export const wasIn = (containerId: string): PreviousPlacement => ({
  kind: 'container',
  containerId,
});

/** Creates a remembered placement whose former place was deleted. */
export const wasDeleted = (name: string): PreviousPlacement => ({ kind: 'deleted', name });

/** Optional fields that override an item fixture's defaults. */
export type ItemExtras = Partial<Omit<ItemRowModel, 'id' | 'name' | 'typeId' | 'placement'>>;

/** Builds one inventory item fixture. */
export function item(
  [id, name, typeId]: readonly [string, string, string | null],
  placement: Placement,
  extras: ItemExtras = {}
): ItemRowModel {
  return {
    id,
    name,
    typeId,
    typeName: typeLabel(typeId),
    code: null,
    quantity: 1,
    container: null,
    lifecycle: 'active',
    placement,
    previous: null,
    sync: 'synced',
    photoUrl: null,
    note: null,
    updatedAt: '2026-09-20T09:00:00.000Z',
    ...extras,
  };
}

/** Builds a fixture item whose type grants containment. */
export function box(
  ids: readonly [string, string, string],
  placement: Placement,
  access: ContainerAccess,
  extras: ItemExtras & { full?: boolean } = {}
): ItemRowModel {
  const { full = false, ...rest } = extras;
  return item(ids, placement, { container: { access, full }, ...rest });
}
