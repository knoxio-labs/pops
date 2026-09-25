/**
 * Builders that keep the named fixtures one line each: a placement helper per
 * kind and an item builder that fills every field a row reads with the quiet
 * default (active, synced, no code, quantity 1).
 */
import { typeLabel } from './core-types';

import type {
  ContainerAccess,
  ItemRowModel,
  Placement,
  PreviousPlacement,
} from '@/kit/inventory/shared/model';

/** Directly in a location. */
export const at = (locationId: string): Placement => ({ kind: 'location', locationId });

/** Inside a container. */
export const inBox = (containerId: string): Placement => ({ kind: 'container', containerId });

/** In hand. */
export const inHand: Placement = { kind: 'in-hand' };

/** A remembered location the item came from. */
export const wasAt = (locationId: string): PreviousPlacement => ({ kind: 'location', locationId });

/** A remembered container the item came from. */
export const wasIn = (containerId: string): PreviousPlacement => ({
  kind: 'container',
  containerId,
});

/** A remembered place that has since been deleted. */
export const wasDeleted = (name: string): PreviousPlacement => ({ kind: 'deleted', name });

/** Everything an item can override beyond its id, name, type and placement. */
export type ItemExtras = Partial<Omit<ItemRowModel, 'id' | 'name' | 'typeId' | 'placement'>>;

/** Builds one fixture item. */
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

/** Builds one fixture container: an item whose type grants containment. */
export function box(
  ids: readonly [string, string, string],
  placement: Placement,
  access: ContainerAccess,
  extras: ItemExtras & { full?: boolean } = {}
): ItemRowModel {
  const { full = false, ...rest } = extras;
  return item(ids, placement, { container: { access, full }, ...rest });
}
