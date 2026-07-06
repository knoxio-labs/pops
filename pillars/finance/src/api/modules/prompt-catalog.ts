import { buildAnalyzePrompt, buildGeneratePrompt } from './corrections/ai-analyze.js';
import { buildInterpretPrompt } from './corrections/ai-feedback.js';
import { buildRevisePrompt } from './corrections/ai-propose.js';
import { CORRECTIONS_DEFAULT_MODEL } from './corrections/ai-runtime.js';
/**
 * Live snapshot of every AI prompt template sent to Claude — built by calling
 * the real `build*Prompt` functions with representative sample inputs, so the
 * catalog can never drift from what the pillar actually sends (CF028, #2619).
 *
 * `scripts/generate-prompt-catalog.ts` serializes {@link buildPromptCatalog}'s
 * output to the checked-in `prompt-catalog.json`, exported as
 * `@pops/finance/prompt-catalog` for the app's read-only PromptViewerPage. CI's
 * codegen-drift gate re-runs the generator and fails on any diff, so an edit
 * to a `build*Prompt` function without regenerating breaks the build rather
 * than silently going stale.
 *
 * Sample inputs are fabricated (no real transaction data) and carry no PII —
 * consistent with the "merchant descriptions only" rule the real prompts
 * themselves follow.
 */
import { buildPrompt } from './imports/ai-categorizer-api.js';
import { CATEGORIZER_DEFAULT_MODEL } from './imports/ai-categorizer.js';

import type { ChangeSet } from '../../contract/rest-corrections.js';
import type {
  AcceptedCorrectionExample,
  CorrectionInput,
  GenerateRulesTransaction,
} from './corrections/ai-analyze.js';
import type { ReviseArgs } from './corrections/ai-propose.js';
import type { CorrectionSignal } from './corrections/ai-types.js';

export interface PromptCatalogEntry {
  id: string;
  title: string;
  model: string;
  description: string;
  template: string;
}

const SAMPLE_KNOWN_TAGS = ['Groceries', 'Dining', 'Transport', 'Utilities', 'Subscriptions'];

const SAMPLE_KNOWN_ENTITY_NAMES = ['Coles', 'Netflix', 'Transport for NSW', 'Woolworths'];

const SAMPLE_TRANSACTION = {
  description: 'WOOLWORTHS 2246 SYDNEY NSW AU',
  amount: -45.2,
  date: '2026-01-15',
};

const SAMPLE_ACCEPTED_EXAMPLES: AcceptedCorrectionExample[] = [
  { pattern: 'WOOLWORTHS', matchType: 'contains', entityName: 'Woolworths', tags: ['Groceries'] },
  { pattern: 'NETFLIX.COM', matchType: 'exact', entityName: 'Netflix', tags: ['Subscriptions'] },
];

const SAMPLE_CORRECTION_INPUT: CorrectionInput = {
  description: 'WOOLWORTHS 2246 SYDNEY NSW AU',
  entityName: 'Woolworths',
  amount: -45.2,
};

const SAMPLE_GENERATE_TXNS: GenerateRulesTransaction[] = [
  {
    description: 'WOOLWORTHS 2246 SYDNEY NSW AU',
    entityName: 'Woolworths',
    amount: -45.2,
    account: 'Everyday',
    currentTags: ['Groceries'],
  },
  {
    description: 'NETFLIX.COM',
    entityName: null,
    amount: -19.99,
    account: 'Everyday',
    currentTags: [],
  },
];

const SAMPLE_SIGNAL: CorrectionSignal = {
  descriptionPattern: 'WOOLWORTHS',
  matchType: 'contains',
  entityId: 'entity_woolworths',
  entityName: 'Woolworths',
  location: null,
  tags: ['Groceries'],
  transactionType: 'purchase',
};

const SAMPLE_CHANGE_SET: ChangeSet = {
  source: 'correction-signal',
  reason: 'Create new correction rule from user correction signal',
  ops: [
    {
      op: 'add',
      data: {
        descriptionPattern: 'WOOLWORTHS',
        matchType: 'contains',
        entityId: 'entity_woolworths',
        entityName: 'Woolworths',
        location: null,
        tags: ['Groceries'],
        transactionType: 'purchase',
        confidence: 0.95,
        isActive: true,
      },
    },
  ],
};

const SAMPLE_REVISE_ARGS: ReviseArgs = {
  signal: SAMPLE_SIGNAL,
  currentChangeSet: SAMPLE_CHANGE_SET,
  instruction: 'Match on the exact description instead of "contains"',
  triggeringTransactions: [{ description: 'WOOLWORTHS 2246 SYDNEY NSW AU' }],
};

const SAMPLE_INSTRUCTION = SAMPLE_REVISE_ARGS.instruction;
const SAMPLE_FEEDBACK = 'This also matched an unrelated Woolworths Petrol transaction';

export function buildPromptCatalog(): PromptCatalogEntry[] {
  return [
    {
      id: 'categorize',
      title: 'Transaction Categorisation',
      model: CATEGORIZER_DEFAULT_MODEL,
      description:
        'Used when a bank transaction cannot be matched to a known entity. Extracts a merchant name and spending tags from the allowlisted transaction fields (description, amount, date — never the raw CSV row or account/card columns), grounded by a bounded closed-set hint of known entity names.',
      template: buildPrompt(SAMPLE_TRANSACTION, SAMPLE_KNOWN_TAGS, SAMPLE_KNOWN_ENTITY_NAMES),
    },
    {
      id: 'analyze-correction',
      title: 'Correction Analysis',
      model: CORRECTIONS_DEFAULT_MODEL,
      description:
        "Derives a reusable matching rule (pattern/matchType/confidence) from one transaction the user assigned to an entity, few-shotted with the user's own recently accepted rules.",
      template: buildAnalyzePrompt(SAMPLE_CORRECTION_INPUT, SAMPLE_ACCEPTED_EXAMPLES),
    },
    {
      id: 'generate-rules',
      title: 'Rule Generation',
      model: CORRECTIONS_DEFAULT_MODEL,
      description:
        "Proposes reusable tagging rules from a batch of transactions, few-shotted with the user's own recently accepted rules. Rules are stored and applied automatically to future imports.",
      template: buildGeneratePrompt(
        SAMPLE_GENERATE_TXNS,
        SAMPLE_KNOWN_TAGS,
        SAMPLE_ACCEPTED_EXAMPLES
      ),
    },
    {
      id: 'revise-changeset',
      title: 'ChangeSet Revision',
      model: CORRECTIONS_DEFAULT_MODEL,
      description:
        'Free-text-instructed revision of a proposed correction-rule ChangeSet the user has not yet approved.',
      template: buildRevisePrompt(SAMPLE_REVISE_ARGS, SAMPLE_INSTRUCTION),
    },
    {
      id: 'rejection-interpret',
      title: 'Rejection Feedback Interpretation',
      model: CORRECTIONS_DEFAULT_MODEL,
      description:
        'Adapts a correction signal after the user rejects a proposed ChangeSet, using their free-text feedback.',
      template: buildInterpretPrompt(SAMPLE_SIGNAL, SAMPLE_CHANGE_SET, SAMPLE_FEEDBACK),
    },
  ];
}
