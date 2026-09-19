/**
 * The typed shape of every command the sync mutation protocol accepts
 * (Inventory ADR-002), as the web app is allowed to send them.
 *
 * The wire body types the mutation batch generically (`args: unknown`) --
 * the discriminated union here is this app's own contract with itself, kept
 * in step with `pillars/inventory/contracts/command-vectors-v1.json`
 * (the source of truth the pillar's own command tests generate it from) by
 * `mutation-client.test.ts`, which builds one envelope per op and checks its
 * `op`/`args` pair against a vector fixture.
 */

/** Where an item is, or is going: a place, inside another item, or in hand. */
export type InventoryPlacementTarget =
  | { kind: 'location'; locationId: string }
  | { kind: 'container'; itemId: string }
  | { kind: 'hand' };

interface NewItemInput {
  name: string;
  placement: InventoryPlacementTarget;
  typeKey?: string;
  fields?: Record<string, unknown>;
  note?: string;
  quantity?: number;
}

interface NewLocationInput {
  name: string;
  parentId: string | null;
}

/** One command and its arguments, keyed by `op` exactly as the server expects. */
export type InventoryCommand =
  | { op: 'item.move'; args: { to: InventoryPlacementTarget; verb: 'move' | 'store' | 'pickUp' } }
  | { op: 'item.setAccess'; args: { access: 'open' | 'closed' } }
  | { op: 'item.setFull'; args: { full: boolean } }
  | { op: 'item.setLifecycle'; args: { lifecycle: string; reason?: string } }
  | { op: 'item.restoreDeleted'; args: Record<string, never> }
  | { op: 'event.revert'; args: { seq: number } }
  | { op: 'item.create'; args: { item: NewItemInput } }
  | { op: 'item.edit'; args: Partial<Pick<NewItemInput, 'name' | 'fields' | 'note' | 'quantity'>> }
  | { op: 'item.changeType'; args: { typeKey: string; fields?: Record<string, unknown> } }
  | { op: 'item.setCode'; args: { code: string } }
  | { op: 'item.setQuantity'; args: { quantity: number } }
  | { op: 'item.split'; args: { newItemId: string; quantity: number } }
  | { op: 'item.attachPhoto'; args: { sha256: string; position: number } }
  | { op: 'item.removePhoto'; args: { sha256: string } }
  | { op: 'item.reorderPhotos'; args: { sha256s: string[] } }
  | { op: 'item.delete'; args: Record<string, never> }
  | { op: 'location.create'; args: { location: NewLocationInput } }
  | { op: 'location.rename'; args: { name: string } }
  | { op: 'location.move'; args: { parentId: string | null } }
  | { op: 'location.delete'; args: Record<string, never> };

/** `InventoryCommand['op']`, spelled out so a caller can narrow on it without a value in hand. */
export type InventoryCommandOp = InventoryCommand['op'];
