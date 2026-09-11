import { X } from 'lucide-react';

import { Button } from '@pops/ui';

import { type TagRuleChangeSetOp, tagRuleOpBadge, tagRuleOpDisplayLabel } from './op-helpers';
import { Section } from './Section';
import { OpRow } from './Sections';

import type { PendingTagRuleChangeSet } from '../../../store/importStore';
import type { TagRuleAddCollision } from './useTagRuleAddCollisions';

/** What a staged rule is called on its remove control: the pattern it adds, else its source. */
function ruleName(pcs: PendingTagRuleChangeSet): string {
  const first = pcs.changeSet.ops[0];
  if (first?.op === 'add') return first.data.descriptionPattern;
  return pcs.changeSet.source ?? 'staged rule';
}

/**
 * Every tag rule the commit will write, one block per staged entry, each with
 * its own remove control. Before POPS-3106 this list was read-only: a rule
 * staged in error could only be undone by walking back through the wizard, and
 * not at all once the step that staged it was gone.
 */
export function TagRulesSection({
  pendingTagRuleChangeSets,
  totalTagRuleOps,
  collisions,
  onRemove,
}: {
  pendingTagRuleChangeSets: PendingTagRuleChangeSet[];
  totalTagRuleOps: number;
  /**
   * `collisions[i][j]` for `pendingTagRuleChangeSets[i].changeSet.ops[j]` —
   * `undefined` while the server-side check (POPS-2955) has not resolved
   * yet, in which case every `add` renders as a plain ADD.
   */
  collisions?: TagRuleAddCollision[][];
  /** Drops one staged entry, by its `tempId`, before commit. */
  onRemove: (tempId: string) => void;
}) {
  if (totalTagRuleOps === 0) return null;
  return (
    <Section title="Tag Rule Changes" count={totalTagRuleOps}>
      <div className="space-y-3">
        {pendingTagRuleChangeSets.map((pcs, pcsIndex) => (
          <div key={pcs.tempId} className="flex items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              {pcs.changeSet.source && (
                <p className="text-xs text-muted-foreground">Source: {pcs.changeSet.source}</p>
              )}
              <ul className="space-y-1">
                {pcs.changeSet.ops.map((op, opIndex) => {
                  const rowKey =
                    op.op === 'add'
                      ? `${pcs.tempId}-add-${op.data.descriptionPattern}`
                      : `${pcs.tempId}-${op.op}-${op.id}`;
                  const collision = collisions?.[pcsIndex]?.[opIndex];
                  const typedOp = op as TagRuleChangeSetOp;
                  return (
                    <OpRow
                      key={rowKey}
                      badge={tagRuleOpBadge(typedOp, collision)}
                      label={tagRuleOpDisplayLabel(typedOp, collision)}
                      rowKey={rowKey}
                    />
                  );
                })}
              </ul>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(pcs.tempId)}
              className="shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Remove tag rule ${ruleName(pcs)}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </Section>
  );
}
