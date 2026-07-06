import { z } from 'zod';

/**
 * Shape used by the Tag Rules browser's edit dialog. `descriptionPattern`
 * and `matchType` are deliberately absent — those fields define the rule's
 * identity and are immutable post-create (mirrors `UpdateTransactionTagRuleInput`
 * on the backend), so the dialog only edits entity scope, tags, confidence,
 * priority, and the active flag.
 */
export const TagRuleEditFormSchema = z.object({
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()).min(1, 'At least one tag is required'),
  confidence: z.number().min(0).max(1),
  priority: z.number().int().nonnegative(),
  isActive: z.boolean(),
});

export type TagRuleEditFormValues = z.infer<typeof TagRuleEditFormSchema>;
