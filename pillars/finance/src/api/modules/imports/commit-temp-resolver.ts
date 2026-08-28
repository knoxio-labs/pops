/**
 * Resolve `temp:entity:{uuid}` placeholders in ChangeSet/tag-rule ops to the
 * real entity ids minted during the commit's entity-creation phase. A temp id
 * with no mapping — or any id still carrying a `temp:` prefix — throws via
 * {@link assertPersistableEntityId} rather than being silently persisted, so a
 * missed mapping rolls the commit back instead of planting a dead placeholder.
 *
 * Ported from the monolith `lib/commit-temp-resolver.ts`.
 */
import { assertPersistableEntityId, COMMIT_TEMP_ENTITY_PREFIX } from './commit-validation.js';

import type { TagRuleChangeSet } from '../../../contract/rest-tag-rules.js';
import type { CommitPayload } from './types.js';

function resolveOpEntityId<TOp extends { op: string; data?: { entityId?: string | null } }>(
  op: TOp,
  tempIdMap: Map<string, string>
): TOp {
  if (op.op !== 'add' && op.op !== 'edit') return op;
  const entityId = op.data?.entityId;
  if (entityId == null) return op;

  const resolved = entityId.startsWith(COMMIT_TEMP_ENTITY_PREFIX)
    ? tempIdMap.get(entityId)
    : entityId;
  assertPersistableEntityId(entityId, resolved);
  return { ...op, data: { ...op.data, entityId: resolved } };
}

export function resolveChangeSetTempIds(
  cs: CommitPayload['changeSets'][number],
  tempIdMap: Map<string, string>
): CommitPayload['changeSets'][number] {
  return { ...cs, ops: cs.ops.map((op) => resolveOpEntityId(op, tempIdMap)) };
}

export function resolveTagRuleChangeSetTempIds(
  cs: TagRuleChangeSet,
  tempIdMap: Map<string, string>
): TagRuleChangeSet {
  return { ...cs, ops: cs.ops.map((op) => resolveOpEntityId(op, tempIdMap)) };
}

type TagBearingTagRuleOp = Extract<TagRuleChangeSet['ops'][number], { op: 'add' | 'edit' }>;

/**
 * Whether `op` is one of the two op kinds that carry a `tags` array onto
 * `transaction_tag_rules` (`TagRuleDataSchema.tags` / `TagRuleUpdateSchema.tags`).
 * `disable` and `remove` write no tags. Shared by every reader that needs to
 * agree on which ops are in scope for a tag-rule tag decision — scanning only
 * `add` left an `edit` op as a way past the closed-namespace gate this feeds
 * (POPS-2602), and past the accept/decline filter it also feeds (POPS-2643).
 */
export function isTagBearingTagRuleOp(
  op: TagRuleChangeSet['ops'][number]
): op is TagBearingTagRuleOp {
  return op.op === 'add' || op.op === 'edit';
}

function collectTagsFromOp(op: TagRuleChangeSet['ops'][number], tags: Set<string>): void {
  if (!isTagBearingTagRuleOp(op)) return;
  if (!op.data.tags) return;
  for (const t of op.data.tags) {
    const s = t.trim();
    if (s) tags.add(s);
  }
}

/** Every tag `cs` would write onto a rule, trimmed and de-duplicated. */
export function collectTagsFromTagRuleChangeSet(cs: TagRuleChangeSet): string[] {
  const tags = new Set<string>();
  for (const op of cs.ops) collectTagsFromOp(op, tags);
  return [...tags];
}
