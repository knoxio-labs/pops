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
 * Created-vs-reinforced split for a commit's `add` ops, shared by tag rules
 * (POPS-2755) and correction rules (POPS-2954).
 *
 * An `add` resolving to an existing rule key merges into that rule instead of
 * creating one. Reporting both as adds is what made a merge into a rule the
 * batch never created indistinguishable from a create.
 */
export const RuleWriteCountsSchema = z.object({
  inserted: z.number().int().nonnegative(),
  reinforced: z.number().int().nonnegative(),
});
