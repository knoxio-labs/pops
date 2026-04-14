# Tag Rule Proposal System Implementation

This PR implements the Tag Rule Proposal System (PRD-029) which allows users to:
1. Suggest tags for transactions during import review
2. Have AI suggest tag rules based on those tags
3. See side effects and impacts before applying rules
4. Approve or reject proposed rules with feedback

## Files Changed

### apps/pops-api/src/modules/finance/imports/router.ts
- Added `generateTagRuleProposal` endpoint to create tag rule change sets from confirmed transactions
- Added `applyTagRuleChangeSetAndReevaluate` endpoint for applying rules

### packages/app-finance/src/components/imports/TagReviewStep.tsx
- Updated TagReviewStep to include "Learn from Tag Edits" functionality
- Integrated with the new proposal generation system