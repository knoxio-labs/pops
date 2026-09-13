import { Button } from '@pops/ui';

import { ProposalsList } from './rule-creation/ProposalsList';
import { stageable } from './rule-creation/refused-proposals';
import { useRuleProposals } from './rule-creation/useRuleProposals';

function StepFooter({
  onBack,
  onSkip,
  onCreate,
  selectedCount,
  hasProposals,
}: {
  onBack: () => void;
  onSkip: () => void;
  onCreate: () => void;
  selectedCount: number;
  hasProposals: boolean;
}) {
  const label = `Create ${selectedCount > 0 ? `${selectedCount} ` : ''}${selectedCount === 1 ? 'rule' : 'rules'} →`;
  return (
    <div className="flex justify-between pt-2">
      <Button variant="outline" onClick={onBack}>
        Back
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onSkip}>
          Skip
        </Button>
        {hasProposals && (
          <Button onClick={onCreate} disabled={selectedCount === 0}>
            {label}
          </Button>
        )}
      </div>
    </div>
  );
}

export function RuleCreationStep() {
  const { proposals, refusedById, collisions, checked, toggle, leaveStaging, prevStep } =
    useRuleProposals();
  const chosen = stageable(proposals, checked, refusedById);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Create rules</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tags in this import that no existing rule or merchant default already supplies. Tick the
          ones worth a rule; saved rules apply automatically on future imports.
        </p>
      </div>
      <ProposalsList
        proposals={proposals}
        checked={checked}
        onToggle={toggle}
        refusedById={refusedById}
        collisions={collisions}
      />
      <StepFooter
        onBack={prevStep}
        onSkip={() => leaveStaging([])}
        onCreate={() => leaveStaging(chosen)}
        selectedCount={chosen.length}
        hasProposals={proposals.length > 0}
      />
    </div>
  );
}
