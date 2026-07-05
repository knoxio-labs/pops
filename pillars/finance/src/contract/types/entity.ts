/**
 * The entity (contact) discriminator set. Mirrors the contacts pillar's
 * `ENTITY_TYPES` byte-for-byte (`pillars/contacts/src/entities/model.rs`).
 * Kept as a contract-level copy — separate from the db-level copy in
 * `src/db/entity-types.ts` — so consumers of `@pops/finance` (the app's
 * entity form/filters) get the value without a workspace dependency on
 * finance's backend package.
 */
export const ENTITY_TYPES = [
  'company',
  'person',
  'government',
  'bank',
  'place',
  'brand',
  'organisation',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

/**
 * A finance entity (counterparty) — a vendor, employer, or person that
 * appears on the other side of a transaction. Mirrors the API response
 * (camelCase) for the finance pillar.
 *
 * The runtime persistence row carries additional fields (`type`, `abn`,
 * `defaultTransactionType`, etc.); the contract pins only the shape
 * downstream consumers need to render and reference an entity.
 */
export interface Entity {
  id: string;
  name: string;
  /**
   * Alternate names this entity is also known by. Empty array when the
   * entity has no aliases. Order is preserved from the source row.
   */
  aliases: readonly string[];
  /** ISO-8601 timestamp. Validated by `EntitySchema` via `.datetime()`. */
  lastEditedTime: string;
}
