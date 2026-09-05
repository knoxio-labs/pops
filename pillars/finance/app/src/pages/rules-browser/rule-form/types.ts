import { z } from 'zod';

import type { MatchType } from '../types';

/**
 * Shape used by the manual create/edit dialog form (#2187). Mirrors the
 * subset of the `transactionCorrections` row that a human editor cares
 * about: the pattern + match type that drive matching, the tags applied
 * on a hit, the active toggle, and the priority used for ordering.
 *
 * Confidence is intentionally NOT exposed here — that field is governed
 * by the AI feedback loop (see `ConfidenceSlider` in the table). New
 * rules created manually rely on the API's createOrUpdate default of
 * 0.5 and edits to existing rules leave confidence untouched.
 */
export const RuleFormSchema = z.object({
  descriptionPattern: z.string().min(1, 'Pattern is required'),
  /**
   * Optional account scope (POPS-2593). `null` — the default — is "any
   * account", which is what every rule was before the field existed and what
   * every proposal still produces. Set it only for a merchant that genuinely
   * differs per account, such as two banks both posting `LATE FEE`.
   */
  accountId: z.string().nullable(),
  matchType: z.enum(['exact', 'contains', 'regex']),
  entityId: z.string().nullable().optional(),
  tags: z.array(z.string()),
  priority: z.number().int().nonnegative(),
  isActive: z.boolean(),
});

export type RuleFormValues = z.infer<typeof RuleFormSchema>;

export const DEFAULT_RULE_FORM_VALUES: RuleFormValues = {
  descriptionPattern: '',
  accountId: null,
  matchType: 'contains',
  entityId: null,
  tags: [],
  priority: 0,
  isActive: true,
};

export const MATCH_TYPE_OPTIONS: ReadonlyArray<{ label: string; value: MatchType }> = [
  { label: 'Contains', value: 'contains' },
  { label: 'Exact', value: 'exact' },
  { label: 'Regex', value: 'regex' },
];

export interface RulePreviewMatch {
  id: string;
  description: string;
  accountId: string;
  amount: number;
  date: string;
  entityName: string | null;
  tags: string[];
}

export interface RulePreviewResult {
  matches: RulePreviewMatch[];
  total: number;
  scanned: number;
  truncated: boolean;
}
