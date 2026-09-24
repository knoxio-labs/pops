import { GROCER_ENTITY_ID } from './entities';
import { PROPOSAL_TRANSACTION_ID, TRANSACTIONS } from './transactions';

import type {
  CorrectionsListResponses,
  CorrectionsProposeChangeSetResponses,
  TagRulesListResponses,
} from '../../finance-api/types.gen';

/**
 * The rules the rules browsers list, and one correction proposal.
 *
 * The proposal is the reasoning a correction exists to show: one ledger row
 * (`HBR GROCER PTY 118`) was saved against no entity, the existing rule only
 * matches the long form of the name, and the proposal widens it so the row is
 * reattributed to Harbour Grocer. `preview.affected` carries that row's
 * before and after, which is what the import wizard's proposal dialog draws.
 */

type Correction = CorrectionsListResponses[200]['data'][number];

export const GROCER_RULE_ID = 'rule-harbour-grocer';

const CREATED = '2026-03-02T09:00:00.000Z';

export const CORRECTIONS: Correction[] = [
  {
    id: GROCER_RULE_ID,
    descriptionPattern: 'HARBOUR GROCER',
    matchType: 'contains',
    entityId: GROCER_ENTITY_ID,
    entityName: 'Harbour Grocer',
    tags: ['groceries'],
    transactionType: 'purchase',
    accountId: null,
    location: null,
    confidence: 0.92,
    priority: 10,
    isActive: true,
    timesApplied: 2,
    lastUsedAt: '2026-09-04T10:00:00.000Z',
    createdAt: CREATED,
  },
  {
    id: 'rule-payroll',
    descriptionPattern: '^PAYROLL ',
    matchType: 'regex',
    entityId: null,
    entityName: null,
    tags: ['salary'],
    transactionType: 'income',
    accountId: null,
    location: null,
    confidence: null,
    priority: 5,
    isActive: true,
    timesApplied: 1,
    lastUsedAt: '2026-09-01T10:00:00.000Z',
    createdAt: CREATED,
  },
];

const [grocerRule] = CORRECTIONS;
const proposalRow = TRANSACTIONS.find((t) => t.id === PROPOSAL_TRANSACTION_ID);

export const CORRECTION_PROPOSAL: CorrectionsProposeChangeSetResponses[200] = {
  rationale:
    'HBR GROCER PTY is the same merchant as HARBOUR GROCER; the rule only matched the long form.',
  changeSet: {
    source: 'standalone-fixture',
    reason: 'Unmatched row with a known alias',
    ops: [
      {
        op: 'edit',
        id: GROCER_RULE_ID,
        data: { descriptionPattern: 'HARBOUR GROCER|HBR GROCER', matchType: 'regex' },
      },
    ],
  },
  preview: {
    counts: { affected: 1, entityChanges: 1, locationChanges: 0, tagChanges: 1, typeChanges: 0 },
    affected: [
      {
        transactionId: PROPOSAL_TRANSACTION_ID,
        description: proposalRow?.description ?? '',
        before: {
          entityId: null,
          entityName: null,
          location: null,
          ruleId: null,
          tags: [],
          transactionType: 'purchase',
        },
        after: {
          entityId: GROCER_ENTITY_ID,
          entityName: 'Harbour Grocer',
          location: null,
          ruleId: GROCER_RULE_ID,
          tags: ['groceries'],
          transactionType: 'purchase',
        },
      },
    ],
  },
  targetRules: grocerRule === undefined ? {} : { [GROCER_RULE_ID]: grocerRule },
};

type TagRule = TagRulesListResponses[200]['data'][number];

export const TAG_RULES: TagRule[] = [
  {
    id: 'tag-rule-groceries',
    descriptionPattern: 'GROCER',
    matchType: 'contains',
    entityId: null,
    tags: ['groceries'],
    confidence: 0.9,
    priority: 10,
    isActive: true,
    timesApplied: 3,
    lastUsedAt: '2026-09-04T10:00:00.000Z',
    ledgerMatchStatus: 'matched',
    overlaps: [],
    createdAt: CREATED,
  },
  {
    id: 'tag-rule-fuel',
    descriptionPattern: 'FUEL',
    matchType: 'contains',
    entityId: null,
    tags: ['transport'],
    confidence: 0.8,
    priority: 5,
    isActive: true,
    timesApplied: 1,
    lastUsedAt: '2026-08-27T10:00:00.000Z',
    ledgerMatchStatus: 'matched',
    overlaps: [],
    createdAt: CREATED,
  },
];

export const TAG_VOCABULARY = ['groceries', 'salary', 'transport'];
