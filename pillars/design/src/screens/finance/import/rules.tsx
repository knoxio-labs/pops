import { ruleProposals, type RuleProposalFixture } from '@/fixtures/import-transactions';

import { Badge, Button, Checkbox, EmptyState, Label, PageHeader } from '@pops/ui';

import { choiceOf } from './context';
import { ImportContextStrip } from './upload';

import type { ScreenMeta, ScreenStates } from '@/contract';

export const meta: ScreenMeta = { title: 'Rules', order: 7, frame: 'web' };

const AMEX = choiceOf('a2', 'amex-csv');

function ProposalCard({ proposal, checked }: { proposal: RuleProposalFixture; checked: boolean }) {
  return (
    <div
      className={`space-y-3 rounded-lg border p-4 ${
        checked ? 'border-info/40 bg-info/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-start gap-3">
        <Checkbox id={proposal.id} checked={checked} className="mt-0.5" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={proposal.id} className="font-medium">
              {proposal.entityName}
            </Label>
            <Badge variant="secondary" className="text-xs">
              {proposal.affectsCount} {proposal.affectsCount === 1 ? 'transaction' : 'transactions'}
            </Badge>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            contains &ldquo;{proposal.pattern}&rdquo;
          </p>
          <div className="flex flex-wrap gap-1.5">
            {proposal.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProposalsList({
  proposals,
  checkedIds,
}: {
  proposals: RuleProposalFixture[];
  checkedIds: Set<string>;
}) {
  if (proposals.length === 0) {
    return (
      <EmptyState
        size="sm"
        className="rounded-lg border border-dashed"
        title="No tag patterns detected in this import."
        description="Tag transactions in the previous step to enable rule detection."
      />
    );
  }
  return (
    <div className="space-y-3">
      {proposals.map((proposal) => (
        <ProposalCard key={proposal.id} proposal={proposal} checked={checkedIds.has(proposal.id)} />
      ))}
    </div>
  );
}

function StepFooter({
  selectedCount,
  hasProposals,
}: {
  selectedCount: number;
  hasProposals: boolean;
}) {
  const label = `Create ${selectedCount > 0 ? `${selectedCount} ` : ''}${selectedCount === 1 ? 'rule' : 'rules'} →`;
  return (
    <div className="flex justify-between pt-2">
      <Button variant="outline">Back</Button>
      <div className="flex gap-2">
        <Button variant="outline">Skip</Button>
        {hasProposals && <Button disabled={selectedCount === 0}>{label}</Button>}
      </div>
    </div>
  );
}

function Step({
  proposals,
  checkedIds,
}: {
  proposals: RuleProposalFixture[];
  checkedIds: Set<string>;
}) {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <PageHeader
        title="Create rules"
        description="These tag patterns were detected from this import. Saved rules apply automatically on future imports."
      />
      <ImportContextStrip choice={AMEX} editable={false} />
      <ProposalsList proposals={proposals} checkedIds={checkedIds} />
      <StepFooter selectedCount={checkedIds.size} hasProposals={proposals.length > 0} />
    </div>
  );
}

const ALL_CHECKED = new Set(ruleProposals.map((p) => p.id));

export default function ImportRulesStep() {
  return <Step proposals={ruleProposals} checkedIds={ALL_CHECKED} />;
}

export const states: ScreenStates = {
  'none-detected': () => <Step proposals={[]} checkedIds={new Set()} />,
  'partially-selected': () => (
    <Step proposals={ruleProposals} checkedIds={new Set(ruleProposals.slice(1).map((p) => p.id))} />
  ),
  'none-selected': () => <Step proposals={ruleProposals} checkedIds={new Set()} />,
};
