/**
 * The per-op counts a commit reports back about the rules it applied.
 *
 * Split out of `rest-imports-schemas.ts` so that file stays under the per-file
 * line cap.
 */
import { z } from 'zod';

export const RulesAppliedSchema = z.object({
  add: z.number().int().nonnegative(),
  edit: z.number().int().nonnegative(),
  disable: z.number().int().nonnegative(),
  remove: z.number().int().nonnegative(),
});

/**
 * Created-vs-reinforced split for a commit's tag-rule `add` ops.
 *
 * An `add` resolving to an existing `(pattern, matchType, entityId)` merges
 * into that rule instead of creating one. Reporting both as adds is what made
 * a merge into a rule the batch never created indistinguishable from a create
 * (POPS-2755).
 */
export const TagRuleWritesSchema = z.object({
  inserted: z.number().int().nonnegative(),
  reinforced: z.number().int().nonnegative(),
});
