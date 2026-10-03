import { tags } from '../schema.js';

import type { TagsDb } from '../open-tags-db.js';
import type { ExpandedTagIds, TagRecord } from './tags-internal.js';

interface TagIndexes {
  byId: Map<string, TagRecord>;
  childrenByParent: Map<string, string[]>;
  mergedByTarget: Map<string, string[]>;
}

function indexTags(rows: TagRecord[]): TagIndexes {
  const byId = new Map(rows.map((tag) => [tag.id, tag]));
  const childrenByParent = new Map<string, string[]>();
  const mergedByTarget = new Map<string, string[]>();

  for (const tag of rows) {
    if (tag.parentId !== null) {
      const children = childrenByParent.get(tag.parentId) ?? [];
      children.push(tag.id);
      childrenByParent.set(tag.parentId, children);
    }
    if (tag.mergedIntoId !== null) {
      const merged = mergedByTarget.get(tag.mergedIntoId) ?? [];
      merged.push(tag.id);
      mergedByTarget.set(tag.mergedIntoId, merged);
    }
  }
  return { byId, childrenByParent, mergedByTarget };
}

function resolveLiveTagId(id: string, byId: Map<string, TagRecord>): string {
  let current = byId.get(id);
  if (current === undefined) return id;
  const followed = new Set<string>();
  while (current.mergedIntoId !== null && !followed.has(current.id)) {
    followed.add(current.id);
    const target = byId.get(current.mergedIntoId);
    if (target === undefined) break;
    current = target;
  }
  return current.id;
}

function resolveRequestedIds(
  ids: readonly string[],
  byId: Map<string, TagRecord>
): { roots: string[]; unknownIds: Set<string> } {
  const roots: string[] = [];
  const unknownIds = new Set<string>();
  for (const id of ids) {
    if (!byId.has(id)) {
      unknownIds.add(id);
    } else {
      roots.push(resolveLiveTagId(id, byId));
    }
  }
  return { roots, unknownIds };
}

function collectTagClosure(roots: string[], indexes: TagIndexes): Set<string> {
  const included = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const id = pending.pop();
    if (id === undefined || included.has(id)) continue;
    included.add(id);
    pending.push(...(indexes.childrenByParent.get(id) ?? []));
    pending.push(...(indexes.mergedByTarget.get(id) ?? []));
  }
  return included;
}

/**
 * Resolve merged identities, then expand each live tag to descendants and
 * merged-away identities. Unknown request ids are returned separately.
 */
export function expandTagIds(db: TagsDb, ids: readonly string[]): ExpandedTagIds {
  const indexes = indexTags(db.select().from(tags).all());
  const requested = resolveRequestedIds(ids, indexes.byId);
  const included = collectTagClosure(requested.roots, indexes);
  return {
    ids: [...included].toSorted(),
    unknownIds: [...requested.unknownIds].toSorted(),
  };
}
