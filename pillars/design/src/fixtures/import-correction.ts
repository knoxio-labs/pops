/**
 * Fictional fixtures for the correction-proposal workflow dialog — the
 * ops list, per-op detail data, impact preview and AI helper transcript.
 * Shaped like what `correction-proposal/types.ts` carries, not copied from
 * it: a design fixture owes nothing to the wire format and must not import
 * from the finance app or its generated client.
 */

export type CorrectionOpKind = 'add' | 'edit' | 'disable';

export interface TargetRuleFixture {
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  entityName?: string;
  location?: string;
  transactionType?: string;
}

export interface CorrectionOpFixture {
  clientId: string;
  kind: CorrectionOpKind;
  dirty: boolean;
  summary: string;
  /** `add` only — the new rule being proposed. */
  descriptionPattern?: string;
  matchType?: 'exact' | 'contains' | 'regex';
  entityName?: string;
  transactionType?: string;
  location?: string;
  /** `edit` / `disable` only — the rule this op targets. */
  targetRule?: TargetRuleFixture;
  /** `disable` only. */
  rationale?: string;
}

export const editRuleOp: CorrectionOpFixture = {
  clientId: 'op-edit-1',
  kind: 'edit',
  dirty: true,
  summary: 'GROUNDS OF ALEX → The Grounds of Alexandria',
  entityName: 'The Grounds of Alexandria',
  transactionType: 'purchase',
  location: 'Alexandria',
  targetRule: {
    pattern: 'GROUNDS OF ALEX',
    matchType: 'contains',
    entityName: 'The Grounds Cafe',
    transactionType: 'purchase',
  },
};

export const addRuleOp: CorrectionOpFixture = {
  clientId: 'op-add-1',
  kind: 'add',
  dirty: false,
  summary: '(no pattern) → unclassified',
  descriptionPattern: '',
  matchType: 'contains',
};

export const disableRuleOp: CorrectionOpFixture = {
  clientId: 'op-disable-1',
  kind: 'disable',
  dirty: false,
  summary: 'AMAZON AU (disable)',
  targetRule: {
    pattern: 'AMAZON AU',
    matchType: 'contains',
    entityName: 'Amazon',
    transactionType: 'purchase',
  },
  rationale: '',
};

export const correctionOps: CorrectionOpFixture[] = [editRuleOp, addRuleOp, disableRuleOp];

export const opKindLabel: Record<CorrectionOpKind, string> = {
  add: 'Add rule',
  edit: 'Edit rule',
  disable: 'Disable rule',
};

export const opKindBadgeVariant: Record<CorrectionOpKind, 'default' | 'secondary' | 'outline'> = {
  add: 'default',
  edit: 'secondary',
  disable: 'outline',
};

export const matchTypeOptions = [
  { value: 'exact', label: 'Exact' },
  { value: 'contains', label: 'Contains' },
  { value: 'regex', label: 'Regex' },
];

export const transactionTypeOptions = [
  { value: '', label: 'Unset' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'refund', label: 'Refund' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'income', label: 'Income' },
];

export const filledDisableRationale =
  'Too broad — this pattern also catches Amazon Prime Video and Amazon Web Services charges, which should stay unclassified until we can split them.';

export interface ImpactDiffItem {
  description: string;
  changed: boolean;
  before: string;
  after: string;
}

export interface ImpactResultFixture {
  total: number;
  newMatches: number;
  removedMatches: number;
  statusChanges: number;
  changed: ImpactDiffItem[];
  unchangedCount: number;
}

export const importImpact: ImpactResultFixture = {
  total: 4,
  newMatches: 1,
  removedMatches: 0,
  statusChanges: 3,
  changed: [
    {
      description: 'SQ *THE GROUNDS OF ALEX',
      changed: true,
      before: 'uncertain',
      after: 'matched',
    },
    { description: 'SQ *GROUNDS OF ALEX 2', changed: true, before: 'unmatched', after: 'matched' },
    {
      description: 'GROUNDS OF ALEXANDRIA CAFE',
      changed: true,
      before: 'matched (old rule)',
      after: 'matched',
    },
  ],
  unchangedCount: 1,
};

export const existingImpact: ImpactResultFixture = {
  total: 12,
  newMatches: 0,
  removedMatches: 0,
  statusChanges: 12,
  changed: [
    {
      description: 'GROUNDS OF ALEX 4521',
      changed: true,
      before: 'matched (old rule)',
      after: 'matched',
    },
    {
      description: 'SQ *GROUNDS OF ALEX',
      changed: true,
      before: 'matched (old rule)',
      after: 'matched',
    },
  ],
  unchangedCount: 0,
};

export const existingImpactTruncated: ImpactResultFixture & { dbTotal: number } = {
  ...existingImpact,
  total: 200,
  dbTotal: 1842,
};

export interface AiMessageFixture {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export const aiHelperTranscript: AiMessageFixture[] = [
  {
    id: 'm1',
    role: 'user',
    text: 'split location into its own rule',
  },
  {
    id: 'm2',
    role: 'assistant',
    text: 'Moved "Alexandria" out of the description pattern and into the rule\'s location field — the pattern now matches on merchant name alone.',
  },
];
