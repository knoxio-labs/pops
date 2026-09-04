/** Fictional data for the import wizard's Rules and Commit/Summary steps. */
export interface RuleProposalFixture {
  id: string;
  entityName: string;
  pattern: string;
  affectsCount: number;
  tags: string[];
}

export const ruleProposals: RuleProposalFixture[] = [
  {
    id: 'rp1',
    entityName: 'The Grounds of Alexandria',
    pattern: 'GROUNDS OF ALEX',
    affectsCount: 1,
    tags: ['dining'],
  },
  { id: 'rp2', entityName: 'Amazon', pattern: 'AMAZON AU', affectsCount: 3, tags: ['household'] },
];

export interface CommitResultFixture {
  entitiesCreated: number;
  transactionsImported: number;
  transactionsFailed: number;
  failedDetails?: { checksum?: string; error: string }[];
  rulesApplied: { add: number; edit: number; disable: number; remove: number };
  tagRulesApplied: number;
  retroactiveReclassifications: number;
}

export const commitResult: CommitResultFixture = {
  entitiesCreated: 2,
  transactionsImported: 9,
  transactionsFailed: 1,
  failedDetails: [{ checksum: 'k1l2m3', error: 'No transaction type set on a positive amount' }],
  rulesApplied: { add: 2, edit: 1, disable: 0, remove: 0 },
  tagRulesApplied: 2,
  retroactiveReclassifications: 4,
};

export const emptyCommitResult: CommitResultFixture = {
  entitiesCreated: 0,
  transactionsImported: 0,
  transactionsFailed: 0,
  rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
  tagRulesApplied: 0,
  retroactiveReclassifications: 0,
};
