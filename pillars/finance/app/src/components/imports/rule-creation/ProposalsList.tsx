import { Badge, Checkbox, EmptyState, Label } from '@pops/ui';

import { TagBadgeRow } from '../../tags/TagChip';
import { formatTags } from '../final-review/op-helpers';

import type { TagRuleAddCollision } from '../final-review/useTagRuleAddCollisions';
import type { RuleProposal } from './utils';

/** What committing this proposal does to a rule that already exists, if one does. */
function CollisionNote({ collision }: { collision: TagRuleAddCollision | null | undefined }) {
  if (!collision) return null;
  const existing = formatTags(collision.existingTags) || 'no tags yet';
  return collision.isActive ? (
    <p className="text-xs text-muted-foreground">
      Adds to an existing rule, which has: {existing}.
    </p>
  ) : (
    <p className="text-xs text-warning">Re-enables a rule you disabled, which has: {existing}.</p>
  );
}

function ProposalCard({
  proposal,
  checked,
  onToggle,
  refused,
  collision,
}: {
  proposal: RuleProposal;
  checked: boolean;
  onToggle: () => void;
  /** Closed-axis values this rule would write that the vocabulary lacks. */
  refused: string[];
  collision: TagRuleAddCollision | null | undefined;
}) {
  return (
    <div
      className={`rounded-lg border p-4 space-y-3 transition-colors cursor-pointer ${
        checked ? 'border-info/40 bg-info/5' : 'border-border bg-card hover:border-border/80'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id={proposal.id}
          checked={checked && refused.length === 0}
          disabled={refused.length > 0}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Label htmlFor={proposal.id} className="font-medium cursor-pointer">
              {proposal.entityName}
            </Label>
            <Badge variant="secondary" className="text-xs">
              {proposal.affectsCount} {proposal.affectsCount === 1 ? 'transaction' : 'transactions'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            contains &ldquo;{proposal.pattern}&rdquo;
          </p>
          <TagBadgeRow
            tags={proposal.tags}
            className="flex flex-wrap gap-1.5"
            badgeClassName="text-xs"
          />
          <CollisionNote collision={collision} />
          {refused.length > 0 && (
            <p role="alert" className="text-xs text-destructive">
              Not staged: {refused.join(', ')}{' '}
              {refused.length === 1 ? 'is not a value' : 'are not values'} of a closed tag axis.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The Rules step's proposals, each saying what committing it would do to a rule
 * that already exists. Empty, it says why nothing is left to propose.
 */
export function ProposalsList({
  proposals,
  checked,
  onToggle,
  refusedById,
  collisions,
}: {
  proposals: RuleProposal[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  refusedById: ReadonlyMap<string, string[]>;
  /** `collisions[i][0]` for `proposals[i]`'s single `add` op; `undefined` until resolved. */
  collisions: TagRuleAddCollision[][] | undefined;
}) {
  if (proposals.length === 0) {
    return (
      <EmptyState
        size="sm"
        className="rounded-lg border border-dashed"
        title="No tag patterns detected in this import."
        description="Every tag here is already supplied by an existing rule, a merchant's default tags, or a rule saved on Tag Review."
      />
    );
  }
  return (
    <div className="space-y-3">
      {proposals.map((proposal, index) => (
        <ProposalCard
          key={proposal.id}
          proposal={proposal}
          checked={checked.has(proposal.id)}
          onToggle={() => onToggle(proposal.id)}
          refused={refusedById.get(proposal.id) ?? []}
          collision={collisions?.[index]?.[0]}
        />
      ))}
    </div>
  );
}
