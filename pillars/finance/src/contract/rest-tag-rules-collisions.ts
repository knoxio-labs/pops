/**
 * Wire shapes for `tagRules.resolveAddCollisions` (POPS-2955) — split out of
 * `rest-tag-rules-schemas.ts` so that file stays under the per-file line cap.
 */
import { z } from 'zod';

import { TagRuleChangeSetSchema } from './rest-tag-rules-schemas.js';

/** A rule an `add` op would merge into, and the tags it already carries. */
export const TagRuleAddCollisionSchema = z.object({
  ruleId: z.string(),
  existingTags: z.array(z.string()),
});

export const ResolveTagRuleAddCollisionsBody = z.object({
  changeSets: z.array(TagRuleChangeSetSchema),
});

/**
 * `collisions[i]` lines up with `changeSets[i].ops` — one entry per op,
 * `null` for an `add` that would create a new rule (or for any non-`add`
 * op), and the rule it would merge into otherwise.
 */
export const ResolveTagRuleAddCollisionsResultSchema = z.object({
  collisions: z.array(z.array(TagRuleAddCollisionSchema.nullable())),
});
