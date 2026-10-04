/** One all-or-nothing reconciliation pass for the shared tags vocabulary. */
import { sharedTagLinksService, type FinanceDb } from '../../db/index.js';
import { SHARED_TAG_FACETS } from '../../db/tag-facets.js';

import type { TagsClient } from '../tags/client.js';
import type { SharedTag } from '../tags/wire.js';

export interface SharedTagSyncStats {
  skipped: boolean;
  sharedTags: number;
  linked: number;
  conflicts: number;
}

export type SharedTagSyncPassResult =
  | { kind: 'ok'; stats: SharedTagSyncStats; conflicts: string[] }
  | { kind: 'unavailable'; reason: string };

function emptyStats(): SharedTagSyncStats {
  return { skipped: false, sharedTags: 0, linked: 0, conflicts: 0 };
}

function activeInFinance(tag: SharedTag): boolean {
  return !tag.archived || tag.mergedIntoId !== null;
}

async function fetchSharedTags(client: TagsClient): Promise<SharedTag[] | string> {
  const tags: SharedTag[] = [];
  const seen = new Map<string, SharedTag>();
  for (const facet of SHARED_TAG_FACETS) {
    let result: Awaited<ReturnType<TagsClient['list']>>;
    try {
      result = await client.list({ facet, includeArchived: 'true' });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    if (result.kind !== 'ok') return result.kind;
    for (const tag of result.value) {
      if (tag.facet !== facet) return `facet mismatch for ${tag.id}`;
      const previous = seen.get(tag.id);
      if (previous === undefined) {
        seen.set(tag.id, tag);
        tags.push(tag);
      } else if (previous.facet !== tag.facet || previous.name !== tag.name) {
        return `inconsistent shared tag ${tag.id}`;
      }
    }
  }
  return tags;
}

function listLocalTagsToCreate(db: FinanceDb, tags: SharedTag[]): string[] {
  const linkedIds = new Set(
    sharedTagLinksService
      .listVocabularyTagsBySharedIds(
        db,
        tags.map((tag) => tag.id)
      )
      .map((row) => row.sharedTagId)
      .filter((id): id is string => id !== null)
  );
  const alreadyPulled = new Set(
    tags
      .filter((tag) => !linkedIds.has(tag.id))
      .map((tag) => sharedTagLinksService.localTagForSharedName(tag.facet, tag.name))
      .filter((tag): tag is string => tag !== null)
  );
  return sharedTagLinksService
    .listUnlinkedActiveSharedVocabularyTags(db)
    .filter((row) => !alreadyPulled.has(row.tag))
    .map((row) => row.tag);
}

async function createSharedTags(
  client: TagsClient,
  localTags: string[]
): Promise<Array<{ localTag: string; sharedTag: SharedTag }> | string> {
  const created: Array<{ localTag: string; sharedTag: SharedTag }> = [];
  for (const localTag of localTags) {
    const separator = localTag.indexOf(':');
    const facet = localTag.slice(0, separator);
    const name = localTag.slice(separator + 1);
    let result: Awaited<ReturnType<TagsClient['create']>>;
    try {
      result = await client.create({ facet, name });
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
    if (result.kind !== 'ok') return result.kind;
    if (result.value.facet !== facet) return `create facet mismatch for ${localTag}`;
    created.push({ localTag, sharedTag: result.value });
  }
  return created;
}

function recordLinkResult(
  result: ReturnType<typeof sharedTagLinksService.upsertSharedTagVocabulary>,
  stats: SharedTagSyncStats,
  conflicts: string[]
): void {
  if (result.kind === 'linked' || result.kind === 'updated') stats.linked += 1;
  if (result.kind === 'conflict') {
    stats.conflicts += 1;
    conflicts.push(`${result.reason}: ${result.existingTag}`);
  } else if (result.kind === 'missing' || result.kind === 'invalid-name') {
    stats.conflicts += 1;
    conflicts.push(`${result.kind}: ${'tag' in result ? result.tag : result.name}`);
  }
}

function applySharedTags(
  db: FinanceDb,
  tags: SharedTag[],
  created: Array<{ localTag: string; sharedTag: SharedTag }>
): { stats: SharedTagSyncStats; conflicts: string[] } {
  const stats = emptyStats();
  const conflicts: string[] = [];
  for (const tag of tags) {
    recordLinkResult(
      sharedTagLinksService.upsertSharedTagVocabulary(db, {
        sharedTagId: tag.id,
        facet: tag.facet,
        name: tag.name,
        isActive: activeInFinance(tag),
      }),
      stats,
      conflicts
    );
  }
  for (const { localTag, sharedTag } of created) {
    recordLinkResult(
      sharedTagLinksService.linkVocabularyTag(db, {
        tag: localTag,
        sharedTagId: sharedTag.id,
        isActive: activeInFinance(sharedTag),
      }),
      stats,
      conflicts
    );
  }
  stats.sharedTags = tags.length;
  return { stats, conflicts };
}

/** Fetch remote state and apply links only after all remote calls succeed. */
export async function runSharedTagSyncPass(
  db: FinanceDb,
  client: TagsClient
): Promise<SharedTagSyncPassResult> {
  const tags = await fetchSharedTags(client);
  if (typeof tags === 'string') return { kind: 'unavailable', reason: tags };
  const created = await createSharedTags(client, listLocalTagsToCreate(db, tags));
  if (typeof created === 'string') return { kind: 'unavailable', reason: created };
  const applied = db.transaction((tx) => applySharedTags(tx, tags, created));
  return { kind: 'ok', ...applied };
}
