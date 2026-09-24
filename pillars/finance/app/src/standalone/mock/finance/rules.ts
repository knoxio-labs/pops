import { CORRECTION_PROPOSAL, CORRECTIONS, GROCER_RULE_ID, TAG_RULES } from '../../fixtures/rules';
import { PROPOSAL_TRANSACTION_ID, TRANSACTIONS } from '../../fixtures/transactions';
import { done, notFound, ok, page } from '../respond';

import type { MockHandler, MockHandlers } from '@pops/pillar-sdk/testing/api-mock';

import type {
  CorrectionsApplyExistingResponses,
  CorrectionsPreviewChangeSetResponses,
  CorrectionsProposeChangeSetResponses,
  CorrectionsRuleMatchPreviewResponses,
  TagRulesApplyExistingResponses,
  TagRulesFacetsResponses,
  TagRulesMatchPreviewResponses,
  TagRulesPreviewResponses,
} from '../../../finance-api/types.gen';

/**
 * The two rule sets: corrections (description → entity, type, tags) and tag
 * rules. Proposing a change set answers the fixture proposal, whose preview
 * reattributes the one unmatched grocer row.
 */

const [grocerRule] = CORRECTIONS;
const [firstTagRule] = TAG_RULES;

const correctionById: MockHandler = ({ params }) => {
  const rule = CORRECTIONS.find((r) => r.id === params['id']);
  return rule === undefined ? notFound('correction') : { body: { data: rule } };
};

const tagRuleById: MockHandler = ({ params }) => {
  const rule = TAG_RULES.find((r) => r.id === params['id']);
  return rule === undefined ? notFound('tag rule') : { body: { data: rule } };
};

const matchRows = TRANSACTIONS.filter((t) => t.entityName === 'Harbour Grocer').map((t) => ({
  id: t.id,
  amount: t.amount,
  date: t.date,
  description: t.description,
  entityId: t.entityId,
  entityName: t.entityName,
  checksum: null,
}));

const matchPreview = { data: { matches: matchRows, totalCount: matchRows.length } };

const PROPOSAL_DIFFS: CorrectionsPreviewChangeSetResponses[200] = {
  diffs: [
    {
      description: TRANSACTIONS.find((t) => t.id === PROPOSAL_TRANSACTION_ID)?.description ?? '',
      before: { matched: false, status: null, ruleId: null, confidence: null },
      after: { matched: true, status: 'matched', ruleId: GROCER_RULE_ID, confidence: 0.92 },
      changed: true,
    },
  ],
  summary: { total: 1, newMatches: 1, removedMatches: 0, statusChanges: 1, netMatchedDelta: 1 },
};

const { changeSet, rationale, targetRules } = CORRECTION_PROPOSAL;

export const ruleHandlers: MockHandlers = {
  'GET /corrections': (request) => ({ body: page(CORRECTIONS, request) }),
  'POST /corrections': ok({ data: grocerRule, message: 'saved' }),
  'GET /corrections/{id}': correctionById,
  'PATCH /corrections/{id}': ok({ data: grocerRule, message: 'updated' }),
  'DELETE /corrections/{id}': done,
  'POST /corrections/{id}/adjust-confidence': done,
  'POST /corrections/{id}/apply-existing': ok<CorrectionsApplyExistingResponses[200]>({
    data: { dryRun: true, matched: 1, updated: 0, skippedManual: 0, skippedUncertain: 0 },
  }),
  'POST /corrections/analyze': ok({ data: { pattern: 'HBR GROCER', confidence: 0.8 } }),
  'POST /corrections/find-match': ok({ data: grocerRule, status: 'matched' }),
  'POST /corrections/generate-rules': ok({ proposals: [] }),
  'POST /corrections/list-merged': (request) => ({ body: page(CORRECTIONS, request) }),
  'POST /corrections/preview-matches': ok({
    data: { matches: [], scanned: TRANSACTIONS.length, total: 0, truncated: false },
  }),
  'POST /corrections/rule-match-preview':
    ok<CorrectionsRuleMatchPreviewResponses[200]>(matchPreview),
  'POST /corrections/propose-changeset':
    ok<CorrectionsProposeChangeSetResponses[200]>(CORRECTION_PROPOSAL),
  'POST /corrections/revise-changeset': ok({ changeSet, rationale, targetRules }),
  'POST /corrections/preview-changeset': ok(PROPOSAL_DIFFS),
  'POST /corrections/apply-changeset': ok({ data: CORRECTIONS, message: 'applied' }),
  'POST /corrections/reject-changeset': done,

  'GET /tag-rules': (request) => ({ body: page(TAG_RULES, request) }),
  'GET /tag-rules/{id}': tagRuleById,
  'PATCH /tag-rules/{id}': ok({ data: firstTagRule, message: 'updated' }),
  'DELETE /tag-rules/{id}': done,
  'POST /tag-rules/{id}/disable': done,
  'POST /tag-rules/{id}/apply-existing': ok<TagRulesApplyExistingResponses[200]>({
    data: { dryRun: true, matched: 2, updated: 0, refusedFacetConflict: 0 },
  }),
  'GET /tag-rules/facets': ok<TagRulesFacetsResponses[200]>({
    facets: [{ facet: 'groceries', kind: 'open' }],
  }),
  'POST /tag-rules/match-preview': ok<TagRulesMatchPreviewResponses[200]>(matchPreview),
  'POST /tag-rules/preview': ok<TagRulesPreviewResponses[200]>({
    affected: [],
    counts: { affected: 0, newTagProposals: 0, removed: 0, suggestionChanges: 0 },
    newTags: [],
  }),
  'POST /tag-rules/propose': ok({
    changeSet: { ops: [] },
    preview: { affected: [], counts: { affected: 0 } },
    rationale: 'Nothing to propose.',
  }),
  'POST /tag-rules/apply': ok({ rules: TAG_RULES }),
  'POST /tag-rules/reject': done,
  'POST /tag-rules/resolve-add-collisions': ok({ collisions: [] }),
};
