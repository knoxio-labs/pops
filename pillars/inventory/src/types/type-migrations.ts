/**
 * The record of type changes that were deliberately breaking.
 *
 * ADR-002 (D5): "a change that removes a choice, changes a dimension or
 * removes a field fails unless it ships a registered data migration that
 * rewrites affected values". This module is that registration. It carries
 * no migration *code* — the data rewrite itself is a follow-up slice's
 * concern — it is only the list `descriptor.ts`'s compatibility guard
 * checks before failing a build.
 */

/** One registered, deliberately breaking change to a type already shipped. */
export interface TypeMigrationRecord {
  readonly typeKey: string;
  /** Why the change is safe: what rewrote the affected values, and where. */
  readonly description: string;
}

/**
 * Every registered type migration. A1 ships no breaking changes, so this
 * starts empty; a later slice that narrows a choice list or changes a
 * dimension adds an entry here in the same change.
 */
export const TYPE_MIGRATIONS: readonly TypeMigrationRecord[] = [
  {
    typeKey: 'storage_box',
    description:
      '0016_storage_box_dimensions removes the superseded free-text Footprint value before the catalogue exposes separate dimensions',
  },
];

/** Whether `typeKey` has a registered migration covering its current breaking change. */
export function hasMigration(
  typeKey: string,
  migrations: readonly TypeMigrationRecord[] = TYPE_MIGRATIONS
): boolean {
  return migrations.some((migration) => migration.typeKey === typeKey);
}
