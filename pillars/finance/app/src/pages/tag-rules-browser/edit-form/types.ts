import { z } from 'zod';

/**
 * Shape used by the Tag Rules browser's edit dialog. `descriptionPattern`
 * and `matchType` are deliberately absent — those fields define the rule's
 * identity and are immutable post-create (mirrors `UpdateTransactionTagRuleInput`
 * on the backend), so the dialog only edits entity scope, tags, priority, and
 * the active flag. `confidence` is intentionally absent too (finance ADR-004/
 * POPS-3131): it decides nothing and editing it here only invited the belief
 * that it did.
 */
export const TagRuleEditFormSchema = z.object({
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).min(1, 'At least one tag is required'),
  priority: z.number().int().nonnegative(),
  isActive: z.boolean(),
});

export type TagRuleEditFormValues = z.infer<typeof TagRuleEditFormSchema>;
