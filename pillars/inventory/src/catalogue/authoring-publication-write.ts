import { eq } from 'drizzle-orm';

import {
  catalogueCompatibility,
  catalogueEvents,
  catalogueRevisions,
  syncMeta,
} from '../db/schema.js';
import { rebuildSearchIndexForCatalogue } from '../domain/commands/search-index.js';
import { json, requireCatalogue } from './authoring-shared.js';
import { toCatalogueDescriptor } from './authoring-wire.js';
import { rebuildComputedDependencyIndex } from './computed-dependency-index.js';
import { executeCatalogueMigrationInTransaction, type CatalogueMigration } from './migrations.js';

import type { CommandDb } from '../domain/commands/index.js';
import type {
  CatalogueAuthor,
  CatalogueDescriptor,
  CataloguePublicationInput,
} from './authoring-types.js';
import type { CatalogueCompatibilityResult } from './compatibility.js';

export interface PublicationWriteContext {
  readonly db: CommandDb;
  readonly revision: number;
  readonly input: CataloguePublicationInput;
  readonly author: CatalogueAuthor;
  readonly base: ReturnType<typeof requireCatalogue>;
  readonly candidate: ReturnType<typeof requireCatalogue>;
  readonly compatibility: CatalogueCompatibilityResult;
  readonly migration: CatalogueMigration | undefined;
}

/** Commits the catalogue revision, audit event, migration, search and computed-dependency rebuilds. */
export function writePublication(context: PublicationWriteContext): CatalogueDescriptor {
  const { db, revision, input, author, base, candidate, compatibility, migration } = context;
  const now = new Date().toISOString();
  const affectedItems =
    migration === undefined
      ? 0
      : executeCatalogueMigrationInTransaction(db, migration, candidate, now).affectedItems;
  const migrationName = migration?.name ?? input.migrationName ?? null;
  db.insert(catalogueCompatibility)
    .values({
      fromRevision: input.baseRevision,
      toRevision: revision,
      classification: compatibility.classification,
      affectedIdsJson: json(compatibility.affectedIds),
      migrationName,
    })
    .run();
  db.update(catalogueRevisions)
    .set({
      status: 'published',
      publishedActorKind: author.kind,
      publishedActorId: author.id,
      publishedActorLabel: author.label,
      publishedAt: now,
      publicationNote: input.note,
    })
    .where(eq(catalogueRevisions.revision, revision))
    .run();
  db.update(syncMeta)
    .set({ value: String(revision) })
    .where(eq(syncMeta.key, 'catalogue_revision'))
    .run();
  const published = requireCatalogue(db, revision, ['published']);
  const before = toCatalogueDescriptor(db, base);
  const after = toCatalogueDescriptor(db, published);
  db.insert(catalogueEvents)
    .values({
      revision,
      kind: 'published',
      actorKind: author.kind,
      actorId: author.id,
      actorLabel: author.label,
      beforeJson: json(before),
      afterJson: json(after),
      migrationName,
      affectedItems,
      serverTime: now,
    })
    .run();
  rebuildSearchIndexForCatalogue(db, published);
  rebuildComputedDependencyIndex(db, published);
  return after;
}
